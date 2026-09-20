import { lhsText, parseFactId } from '../../domain/facts';
import type { ParentStats } from '../../domain/stats';
import type { Settings } from '../../storage/store';
import { el, screen, type Screen } from '../dom';
import { percent, plural, shortDay } from '../format';

export type ParentMode = 'setup' | 'locked' | 'unlocked';

export interface ParentProps {
  readonly mode: ParentMode;
  readonly biometrics: boolean;
  readonly stats: ParentStats;
  readonly settings: Settings;
  readonly error: string | null;
  readonly busy: boolean;
  readonly onEnrolBiometric: () => void;
  readonly onEnrolPin: (pin: string) => void;
  readonly onUnlockBiometric: () => void;
  readonly onUnlockPin: (pin: string) => void;
  readonly onSaveSettings: (settings: Settings) => void;
  readonly onClearAll: () => void;
  readonly onBack: () => void;
}

const OP_NAME = { mul: 'Times tables', add: 'Adding', sub: 'Taking away' } as const;

function pinField(placeholder: string): HTMLInputElement {
  const input = el('input', { class: 'pin' });
  input.type = 'password';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.maxLength = 6;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  return input;
}

function tile(value: string, label: string): HTMLElement {
  return el('div', {
    class: 'tile',
    children: [
      el('div', { class: 'tile__value', text: value }),
      el('div', { class: 'tile__label', text: label }),
    ],
  });
}

function numberField(label: string, value: number, min: number, max: number): HTMLElement {
  const input = el('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.setAttribute('aria-label', label);
  return el('div', {
    class: 'field',
    children: [el('span', { text: label }), input],
  });
}

function trend(stats: ParentStats): HTMLElement {
  const days = stats.daily.slice(-14);
  const bars = el('div', {
    class: 'trend',
    children: days.map((day) => {
      const bar = el('div', { class: 'trend__bar' });
      bar.style.height = `${Math.max(day.accuracy * 100, 4)}%`;
      bar.title = `${shortDay(day.day)}: ${percent(day.accuracy)}`;
      return bar;
    }),
  });

  const first = days[0];
  const last = days[days.length - 1];

  return el('div', {
    children: [
      el('h3', { text: 'Accuracy by day' }),
      bars,
      el('div', {
        class: 'row',
        children: [
          el('span', { class: 'quiet', text: first ? shortDay(first.day) : '' }),
          el('span', { class: 'quiet', text: last ? shortDay(last.day) : '' }),
        ],
      }),
    ],
  });
}

function weakest(stats: ParentStats): HTMLElement {
  if (stats.weakest.length === 0) {
    return el('p', { class: 'quiet', text: 'No facts attempted yet.' });
  }

  return el('div', {
    children: [
      el('h3', { text: 'Hardest facts' }),
      el('div', {
        class: 'list',
        children: stats.weakest.map((fact) => {
          let name = fact.factId;
          try {
            name = lhsText(parseFactId(fact.factId));
          } catch {
            // An id from an older build: show it as stored rather than hide the row.
          }
          return el('div', {
            class: 'list__row',
            children: [
              el('span', { class: 'list__name', text: name }),
              el('span', {
                class: 'list__value',
                text: `${percent(fact.accuracy)} of ${plural(fact.attempts, 'try', 'tries')}`,
              }),
            ],
          });
        }),
      }),
    ],
  });
}

function byOperation(stats: ParentStats): HTMLElement {
  return el('div', {
    children: [
      el('h3', { text: 'By operation' }),
      el('div', {
        class: 'list',
        children: (['mul', 'add', 'sub'] as const).map((op) => {
          const row = stats.byOp[op];
          return el('div', {
            class: 'list__row',
            children: [
              el('span', { text: OP_NAME[op] }),
              el('span', {
                class: 'list__value',
                text: row.attempts
                  ? `${percent(row.accuracy)}, ${row.mastered}/${row.total} learned`
                  : `not started, 0/${row.total} learned`,
              }),
            ],
          });
        }),
      }),
    ],
  });
}

function gate(props: ParentProps): Screen {
  const setup = props.mode === 'setup';
  const pin = pinField(setup ? 'Choose a PIN' : 'PIN');

  const submitPin = (): void => {
    const value = pin.value.trim();
    if (setup) props.onEnrolPin(value);
    else props.onUnlockPin(value);
  };

  pin.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitPin();
  });

  const actions: HTMLElement[] = [];

  if (props.biometrics) {
    actions.push(
      el('button', {
        class: 'btn btn--primary btn--big',
        text: setup ? 'Turn on Face ID' : 'Unlock',
        attrs: { type: 'button', disabled: props.busy },
        onClick: setup ? props.onEnrolBiometric : props.onUnlockBiometric,
      }),
    );
  } else {
    actions.push(
      pin,
      el('button', {
        class: 'btn btn--primary btn--big',
        text: setup ? 'Set PIN' : 'Unlock',
        attrs: { type: 'button', disabled: props.busy },
        onClick: submitPin,
      }),
    );
  }

  return {
    element: screen('screen', [
      el('h2', { text: 'Parents' }),
      props.error ? el('p', { class: 'banner', text: props.error }) : null,
      el('div', {
        class: 'centered',
        children: [
          el('p', {
            class: 'prompt',
            text: setup
              ? 'This area holds the progress stats and the button that erases everything.'
              : 'Locked.',
          }),
          setup
            ? el('p', {
                class: 'quiet',
                text: props.biometrics
                  ? 'Lock it with this phone’s Face ID, Touch ID or passcode so it stays out of reach.'
                  : 'This device has no Face ID available in the browser, so use a PIN instead.',
              })
            : null,
        ],
      }),
      el('div', { class: 'actions', children: actions }),
      el('button', {
        class: 'btn btn--quiet',
        text: 'Back',
        attrs: { type: 'button' },
        onClick: props.onBack,
      }),
    ]),
  };
}

function unlocked(props: ParentProps): Screen {
  const { stats, settings } = props;

  const study = numberField('Study time (seconds)', settings.studySeconds, 5, 120);
  const recall = numberField('Finding time (seconds)', settings.recallSeconds, 5, 120);
  const saved = el('span', { class: 'quiet', text: '' });

  const readSeconds = (field: HTMLElement, fallback: number): number => {
    const input = field.querySelector('input');
    const value = Number(input?.value);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(120, Math.max(5, Math.round(value)));
  };

  const save = el('button', {
    class: 'btn',
    text: 'Save times',
    attrs: { type: 'button' },
    onClick: () => {
      props.onSaveSettings({
        studySeconds: readSeconds(study, settings.studySeconds),
        recallSeconds: readSeconds(recall, settings.recallSeconds),
      });
      saved.textContent = 'Saved.';
    },
  });

  // Erasing is irreversible, so it takes a typed word even behind the lock.
  const confirm = el('input');
  confirm.type = 'text';
  confirm.autocomplete = 'off';
  confirm.placeholder = 'Type clear';
  confirm.setAttribute('aria-label', 'Type clear to confirm');
  confirm.style.cssText =
    'font:inherit;padding:10px;border-radius:10px;border:2px solid var(--rule);background:var(--card);color:var(--ink);width:100%';

  const erase = el('button', {
    class: 'btn btn--danger btn--big',
    text: 'Erase everything',
    attrs: { type: 'button', disabled: true },
    onClick: props.onClearAll,
  });

  confirm.addEventListener('input', () => {
    erase.disabled = confirm.value.trim().toLowerCase() !== 'clear';
  });

  return {
    element: screen('screen screen--scroll', [
      el('h2', { text: 'Parents' }),

      el('div', {
        class: 'tiles',
        children: [
          tile(String(stats.totalRounds), 'rounds played'),
          tile(stats.totalAttempts ? percent(stats.overallAccuracy) : '—', 'facts right'),
          tile(String(stats.activeDays), 'days played'),
          tile(String(stats.totalAttempts), 'facts attempted'),
        ],
      }),

      stats.daily.length > 0 ? trend(stats) : null,
      byOperation(stats),
      weakest(stats),

      el('div', {
        children: [
          el('h3', { text: 'Round timing' }),
          study,
          recall,
          el('div', { class: 'row', children: [save, saved] }),
        ],
      }),

      el('div', {
        children: [
          el('h3', { class: 'danger', text: 'Erase everything' }),
          el('p', {
            class: 'quiet',
            text: 'Removes every round, every learned fact and this lock. It cannot be undone.',
          }),
          confirm,
          el('div', { class: 'spacer' }),
          erase,
        ],
      }),

      el('button', {
        class: 'btn btn--quiet',
        text: 'Back',
        attrs: { type: 'button' },
        onClick: props.onBack,
      }),
    ]),
  };
}

export function parentScreen(props: ParentProps): Screen {
  return props.mode === 'unlocked' ? unlocked(props) : gate(props);
}
