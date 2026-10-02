/**
 * Infinite — dedicated screen: ENTER SEED, PREVIOUS SEEDS, PLAY, HARD MODE,
 * BACK. Seed history stores level + generator/content version so old codes
 * are flagged if the generator changed.
 */
import { CONTENT_VERSION, GENERATOR_VERSION } from '../../config/versions';
import { formatTime } from '../../core/format';
import { decodeSeed, encodeSeed, normalizeSeedInput, randomSeed } from '../../levels/infinite';
import { infiniteDriver } from '../../progression/drivers';
import { CurrencyBar } from '../components/currency';
import { iceButton, woodButton } from '../components/buttons';
import { h } from '../dom';
import { Screen } from '../screen';

export class InfiniteScreen extends Screen {
  readonly id = 'infinite';
  override hash = 'infinite';
  override music = 'infinite' as const;
  override backdrop = { mode: 'infinite' as const };
  private hard = false;
  private input!: HTMLInputElement;
  private err!: HTMLElement;

  build(): void {
    this.el.className = 'screen mode-screen infinite-screen';
    const s = this.app.save.data;
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    this.input = h('input', { class: 'sf-input seed-input', attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '14', placeholder: 'FR0ST-8K2M', 'aria-label': 'Enter seed code' } });
    this.err = h('div', { class: 'seed-error', attrs: { role: 'alert' } });
    this.d.listen(this.input, 'keydown', (e) => { if (e.key === 'Enter') this.playSeed(); });
    this.d.listen(this.input, 'input', () => { this.err.textContent = ''; });
    const hardBtn = iceButton('HARD MODE: OFF', { class: 'hard-toggle', sound: 'ranked', onActivate: () => {
      this.hard = !this.hard;
      hardBtn.querySelector('span')!.textContent = `HARD MODE: ${this.hard ? 'ON' : 'OFF'}`;
      hardBtn.classList.toggle('selected', this.hard);
    } });
    const history = [...s.infinite.history].sort((a, b) => b.playedAt - a.playedAt).slice(0, 20);
    const list = h('div', { class: 'seed-list', attrs: { role: 'list' } });
    if (history.length === 0) list.append(h('p', { class: 'muted', text: 'No seeds yet — every level you play is remembered here.' }));
    for (const e of history) {
      const stale = e.generatorVersion !== GENERATOR_VERSION || e.contentVersion !== CONTENT_VERSION;
      list.append(h('div', { class: 'seed-row', attrs: { role: 'listitem' } },
        h('code', { class: 'seed-code', text: e.code }),
        h('span', { class: 'seed-meta', text: `Level ${e.level}${e.hard ? ' · HARD' : ''}` }),
        h('span', { class: 'seed-best', text: e.bestMs ? formatTime(e.bestMs) : '—' }),
        stale ? h('span', { class: 'chip warn', attrs: { title: 'Made with an older level generator; the layout may differ now.' }, text: 'old version' }) : null,
        iceButton('PLAY', { class: 'seed-play', onActivate: () => this.start(decodeSeed(e.code), e.hard) }),
        iceButton('COPY', { class: 'seed-copy', sound: 'clickSoft', onActivate: () => void this.copy(e.code) }),
      ));
    }
    this.el.append(
      h('div', { class: 'mode-top' }, woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }), h('h1', { class: 'title-wood mode-title', text: 'INFINITE' }), bar.el),
      h('div', { class: 'infinite-grid' },
        h('div', { class: 'ice-panel inf-card' },
          h('h3', { class: 'title-ice', text: 'HOW FAR CAN YOU GO?' }),
          h('p', { text: 'Endless seeded levels. Every level has a reproducible seed and difficulty keeps climbing.' }),
          h('div', { class: 'records' },
            h('div', { class: 'rec' }, h('span', { text: 'BEST' }), h('b', { text: String(s.infinite.highestLevel || '—') })),
            h('div', { class: 'rec hard' }, h('span', { text: 'BEST (HARD)' }), h('b', { text: String(s.infinite.highestLevelHard || '—') })),
          ),
          woodButton('PLAY', { variant: 'green', size: 'big', onActivate: () => this.start(randomSeed(1), this.hard) }),
          hardBtn,
        ),
        h('div', { class: 'ice-panel inf-card' },
          h('h3', { class: 'title-ice', text: 'ENTER SEED' }),
          h('div', { class: 'seed-entry' }, this.input, woodButton('GO', { size: 'small', onActivate: () => this.playSeed() })),
          this.err,
          h('p', { class: 'muted small', text: 'Codes look like FR0ST-8K2M. They include the level number, so a friend can play the exact same level.' }),
          h('h3', { class: 'title-ice', text: 'PREVIOUS SEEDS' }),
          list,
        ),
      ),
    );
  }

  private playSeed(): void {
    const raw = this.input.value.trim();
    if (!raw) { this.err.textContent = 'Type a seed code first.'; return; }
    const seed = decodeSeed(raw);
    if (!seed) {
      this.err.textContent = `“${normalizeSeedInput(raw)}” isn't a valid seed. Codes are 9 letters/numbers like FR0ST-8K2M.`;
      this.app.audio.play('denied', { isUi: true });
      return;
    }
    this.start(seed, this.hard);
  }

  private start(seed: ReturnType<typeof decodeSeed>, hard: boolean): void {
    if (!seed) return;
    void this.router.go('play', { driver: infiniteDriver(this.app.driverServices, seed, hard) });
  }

  private async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.router.toast(`Copied ${code}`);
    } catch {
      this.input.value = code;
      this.router.toast('Copy blocked by the browser — the code is in the box above.');
    }
    void encodeSeed;
  }
}
