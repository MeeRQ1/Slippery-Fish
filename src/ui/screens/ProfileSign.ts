/**
 * Profile — hanging sign. Username (local to this device), the 30 profile
 * icons, penguin + Hood preview, progress summary and the comedic stats list.
 */
import { ADVENTURE_LEVEL_COUNT } from '../../config/regions';
import { formatCount } from '../../core/format';
import { HOODS, HOOD_BY_ID, RARITIES } from '../../progression/hoods';
import { PROFILE_ICONS, profileIconEl } from '../../profile/icons';
import { validateUsername } from '../../profile/username';
import { UNITS_PER_METRE } from '../../quests/quests';
import { WADDLE_BY_ID, WADDLES } from '../../profile/waddles';
import { animate } from '../anim';
import { makePhysical, woodButton } from '../components/buttons';
import { penguinPreview } from '../components/preview';
import { clear, h } from '../dom';
import { SignScreen } from '../screen';
import { equipTitle, equippedTitleName, evaluateProgressTitles, titleViews } from '../../progression/titles';

export class ProfileSign extends SignScreen {
  readonly id = 'profile';
  readonly title = 'PROFILE';
  protected override boardClass = 'wide';
  private head!: HTMLElement;
  private icons!: HTMLElement;
  private titles!: HTMLElement;

  protected buildContent(c: HTMLElement): void {
    evaluateProgressTitles(this.app.save, Date.now());
    this.head = h('div', { class: 'profile-head' });
    this.icons = h('div', { class: 'icon-picker', attrs: { role: 'radiogroup', 'aria-label': 'Profile icon' } });
    this.titles = h('div', { class: 'title-list', attrs: { role: 'radiogroup', 'aria-label': 'Equipped title' } });
    c.append(
      this.head,
      h('h3', { text: 'TITLES' }),
      h('p', { class: 'small muted', text: 'Earn titles by playing. They are labels to show off — no stat bonuses. Timed titles need default rules: no gameplay-stat Hood, no continue, no pause and no level twist.' }),
      this.titles,
      h('h3', { text: 'PROFILE ICON' }),
      this.icons,
      this.progress(),
      this.stats(),
    );
    this.renderHead();
    this.renderTitles();
    this.renderIcons();
  }

  private renderTitles(): void {
    const s = this.app.save.data;
    const views = titleViews(s);
    const unlocked = views.filter((v) => v.unlocked).length;
    clear(this.titles);
    const choose = (id: string | null) => {
      if (!equipTitle(this.app.save, id)) return;
      this.app.audio.play(id ? 'titleUnlock' : 'clickSoft');
      this.renderTitles();
      this.renderHead();
    };
    const none = h('button', { class: `title-card none ${s.titles.equipped === null ? 'on' : ''}`, attrs: { type: 'button', role: 'radio', 'aria-checked': s.titles.equipped === null ? 'true' : 'false' } },
      h('span', { class: 'tc-name', text: 'No title' }), h('span', { class: 'tc-crit small muted', text: `${unlocked} of ${views.length} titles earned` }));
    makePhysical(none, none, { personality: 'profile', sound: 'clickSoft', onActivate: () => choose(null) });
    this.titles.append(none);
    for (const v of views) {
      const on = s.titles.equipped === v.def.id;
      const card = h('button', { class: `title-card ${v.unlocked ? 'unlocked' : 'locked'} ${on ? 'on' : ''}`, attrs: { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', 'aria-disabled': v.unlocked ? 'false' : 'true', 'aria-label': `${v.def.name}: ${v.unlocked ? 'earned' : 'locked'}. ${v.def.criteria}` } },
        h('span', { class: 'tc-name', text: v.unlocked ? v.def.name : `🔒 ${v.def.name}` }),
        h('span', { class: 'tc-crit small', text: v.def.criteria }),
        v.progress && !v.unlocked ? h('span', { class: 'tc-bar', attrs: { 'aria-hidden': 'true' } }, h('i', { style: { width: `${Math.round((v.progress.value / v.progress.target) * 100)}%` } })) : null,
        v.progress && !v.unlocked ? h('span', { class: 'tc-prog small muted', text: `${formatCount(v.progress.value)} / ${formatCount(v.progress.target)}` }) : null,
        on ? h('span', { class: 'tc-eq', text: 'EQUIPPED' }) : null,
      );
      makePhysical(card, card, {
        personality: 'profile', sound: v.unlocked ? 'clickSoft' : 'denied',
        disabledReason: v.unlocked ? undefined : v.def.criteria,
        onActivate: () => { if (v.unlocked) choose(v.def.id); else this.router.toast(`Locked — ${v.def.criteria}`); },
      });
      this.titles.append(card);
    }
  }

  private renderHead(): void {
    const s = this.app.save.data;
    const hood = s.hoods.equipped ? HOOD_BY_ID[s.hoods.equipped] : undefined;
    const input = h('input', { class: 'sf-input name-input', attrs: { type: 'text', value: s.profile.username, maxlength: 16, 'aria-label': 'Username', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' } });
    const msg = h('span', { class: 'name-msg small', attrs: { 'aria-live': 'polite' } });
    const save = woodButton('SAVE NAME', { size: 'small', variant: 'green', sound: 'click', onActivate: () => commit() });
    const commit = (): void => {
      const v = validateUsername(input.value);
      msg.textContent = v.message;
      msg.classList.toggle('bad', !v.ok);
      if (!v.ok) {
        void animate(input, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 260 });
        return;
      }
      input.value = v.value;
      if (v.value === this.app.save.data.profile.username) return;
      this.app.save.mutate((st) => { st.profile.username = v.value; }, { immediate: true });
      this.router.toast(`Hello, ${v.value}!`);
    };
    input.addEventListener('input', () => {
      const v = validateUsername(input.value);
      msg.textContent = input.value.trim() === '' ? '' : v.message;
      msg.classList.toggle('bad', !v.ok);
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing never steers the penguin or closes the sign
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { input.blur(); }
    });
    this.head.replaceChildren(
      h('div', { class: 'ph-avatar' }, profileIconEl(s.profile.iconId, 96)),
      h('div', { class: 'ph-name' },
        h('div', { class: 'ph-title', text: equippedTitleName(s) ?? 'No title equipped' }),
        h('label', { class: 'small muted', text: 'Username', attrs: { for: 'sf-username' } }),
        h('div', { class: 'name-row' }, input, save),
        msg,
        h('p', { class: 'small muted', text: 'Your name is stored on this device only — it isn’t an account and isn’t reserved online.' }),
      ),
      h('div', { class: 'ph-penguin' },
        penguinPreview(s.waddles.selected, s.hoods.equipped, 92),
        h('span', { class: 'small', text: WADDLE_BY_ID[s.waddles.selected]?.name ?? 'Classic' }),
        h('span', { class: 'small muted', text: hood ? `${hood.name} (${RARITIES[hood.rarityIndex]!.name})` : 'No Hood equipped' }),
      ),
    );
    input.id = 'sf-username';
  }

  private renderIcons(): void {
    const current = this.app.save.data.profile.iconId;
    clear(this.icons);
    for (const ic of PROFILE_ICONS) {
      const on = ic.id === current;
      const b = h('button', { class: `icon-opt ${on ? 'on' : ''}`, attrs: { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', 'aria-label': ic.name, title: ic.name } }, profileIconEl(ic.id, 54));
      makePhysical(b, b, {
        personality: 'profile', sound: 'clickSoft',
        onActivate: () => {
          this.app.save.mutate((st) => { st.profile.iconId = ic.id; });
          this.renderIcons();
          this.renderHead();
        },
      });
      this.icons.append(b);
    }
  }

  private progress(): HTMLElement {
    const s = this.app.save.data;
    const stars = Object.values(s.adventure.stars).reduce((a, b) => a + b, 0);
    const cleared = Object.keys(s.adventure.stars).length;
    const cell = (label: string, value: string) => h('div', { class: 'prog-cell' }, h('b', { text: value }), h('span', { class: 'small', text: label }));
    return h('div', {},
      h('h3', { text: 'PROGRESS' }),
      h('div', { class: 'prog-grid' },
        cell('Adventure levels cleared', `${formatCount(cleared)} / ${ADVENTURE_LEVEL_COUNT}`),
        cell('Excellence Stars', `${formatCount(stars)} / ${formatCount(ADVENTURE_LEVEL_COUNT * 5)}`),
        cell('Highest Infinite level', s.infinite.highestLevel ? formatCount(s.infinite.highestLevel) : '—'),
        cell('Highest Infinite (Hard)', s.infinite.highestLevelHard ? formatCount(s.infinite.highestLevelHard) : '—'),
        cell('Hoods collected', `${s.hoods.owned.length} / ${HOODS.length}`),
        cell('Waddles owned', `${s.waddles.owned.length} / ${WADDLES.length}`),
        cell('Ranked', this.app.ranked.status().state === 'ready' ? `${formatCount(s.stats.rankedVictories)} victories` : 'Online Ranked unavailable'),
      ),
    );
  }

  private stats(): HTMLElement {
    const st = this.app.save.data.stats;
    const rows: Array<[string, string]> = [
      ['Fish Successfully Stashed', formatCount(st.fishStashed)],
      ['Fish Tragically Eaten', formatCount(st.fishEaten)],
      ['Distance Waddled', `${formatCount(st.distanceWaddled / UNITS_PER_METRE)} m`],
      ['Times Outmatched', formatCount(st.timesOutmatched)],
      ['Five-Star Levels', formatCount(st.fiveStarLevels)],
      ['Ranked Victories', formatCount(st.rankedVictories)],
      ['Highest Infinite Level', this.app.save.data.infinite.highestLevel ? formatCount(this.app.save.data.infinite.highestLevel) : '—'],
      ['Wall Bounces', formatCount(st.wallBounces)],
      ['Time Spent Sprinting', formatSeconds(st.sprintSeconds)],
      ['Levels Completed', formatCount(st.levelsCompleted)],
      ['Treasure Chests Opened', formatCount(st.chestsOpened)],
    ];
    const list = h('dl', { class: 'stats-list paper-panel' });
    for (const [k, v] of rows) list.append(h('div', { class: 'stat-row' }, h('dt', { text: k }), h('dd', { text: v })));
    return h('div', {}, h('h3', { text: 'STATS' }), list);
  }
}

function formatSeconds(sec: number): string {
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
