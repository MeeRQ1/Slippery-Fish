/**
 * Ranked — dedicated screen. Real online matches require a separate Ranked
 * server (not part of GitHub Pages). Without one, this screen says so
 * plainly and offers a clearly-labelled OFFLINE PRACTICE under Ranked rules.
 * No bot is ever presented as a live opponent.
 */
import { randomSeed } from '../../levels/infinite';
import { practiceDriver } from '../../progression/drivers';
import { RankedAdapter } from '../../services/ranked';
import { CurrencyBar } from '../components/currency';
import { woodButton } from '../components/buttons';
import { h, sprite } from '../dom';
import { Screen } from '../screen';

export class RankedScreen extends Screen {
  readonly id = 'ranked';
  override hash = 'ranked';
  override music = 'ranked' as const;
  override backdrop = { mode: 'ranked' as const };

  build(): void {
    this.el.className = 'screen mode-screen ranked-screen';
    const bar = new CurrencyBar(this.app.wallet);
    this.d.add(() => bar.destroy());
    const status = new RankedAdapter().status();
    const live = status.state === 'ready';
    const findBtn = woodButton('FIND MATCH', {
      variant: 'red', size: 'big', disabled: !live,
      disabledReason: status.state === 'ready' ? '' : status.reason,
      sound: 'ranked',
      onActivate: () => this.router.toast('Matchmaking client is not implemented against a server yet.'),
    });
    this.el.append(
      h('div', { class: 'mode-top' }, woodButton('BACK', { size: 'small', sound: 'back', onActivate: () => void this.router.go('menu') }), h('h1', { class: 'title-wood mode-title', text: 'RANKED' }), bar.el),
      h('div', { class: 'ranked-grid' },
        h('div', { class: 'ice-panel ranked-card' },
          h('div', { class: 'ranked-art' }, sprite('btnicon_ranked_normal', { height: 90 })),
          h('h3', { class: 'title-ice', text: 'SAME CHALLENGE. SKILL DECIDES.' }),
          h('ul', { class: 'rules' },
            h('li', { text: 'Best of three rounds — first to two round wins.' }),
            h('li', { text: 'Both players get the exact same seed and layout each round.' }),
            h('li', { text: 'Fastest valid completion wins the round (times are never added up).' }),
            h('li', { text: 'Hood stat bonuses are switched off. Hoods still look great.' }),
            h('li', { text: 'Results are validated by the server, never trusted from a browser.' }),
          ),
          h('div', { class: `ranked-status ${live ? 'ok' : 'off'}`, attrs: { role: 'status' } },
            h('b', { text: live ? 'Ranked server: connected' : 'Online Ranked: unavailable' }),
            h('span', { text: live ? 'Ready to find a match.' : status.reason }),
          ),
          findBtn,
        ),
        h('div', { class: 'ice-panel ranked-card' },
          h('h3', { class: 'title-ice', text: 'PRACTICE' }),
          h('p', { text: 'Warm up offline under Ranked rules: normalized stats on a fresh seed. This is solo practice — there is no opponent, no ranking and no ranked reward.' }),
          woodButton('PRACTICE RUN', { variant: 'green', onActivate: () => void this.router.go('play', { driver: practiceDriver(this.app.driverServices, randomSeed(20)) }) }),
          h('p', { class: 'muted small', text: 'Ranked Victories on your profile only count real server-validated matches.' }),
        ),
      ),
    );
  }
}
