# Intramural Hoops

App for our intramural 3v3 basketball team: the schedule and who's in, live scorekeeping, box scores and player stats, an injury report, and per-game award voting (MVP plus custom awards). It's built for phones, works with no signal once it has been opened, and can be added to the home screen like an app.

## What's in it

- **Home**: next game with who's in, season record and streak, team leaders, latest MVP, injury report, recent results.
- **Games**: upcoming games (say if you're in), live games, results. Add a final score with a box score, or schedule a game.
- **Live scoring**: tap +1/+2/+3, REB, AST, STL and BLK for each player; the team score adds itself up. A game clock plus Bench/On-court toggles track minutes. Undo fixes mis-taps, and anyone with the link can follow the score live.
- **Players**: leaderboard for any stat (per game or totals), player pages with game log, career highs, awards and injuries, and the injury report.
- **Awards**: MVP and custom awards, voted on each game's page.
- **Share recap**: makes a game graphic for the group chat or a story.

A stat left blank means "not tracked". It shows as "—" and is left out of averages (not counted as 0).

## Who can do what

| | View | Vote for awards | Everything else |
| --- | --- | --- | --- |
| Anyone with the link | ✓ | | |
| Joined with the **fan code** | ✓ | ✓ | |
| Joined with the **team code** | ✓ | ✓ | ✓ (games, scoring, RSVPs, injuries, roster, settings) |

Each phone joins once, then picks which player it belongs to. Anyone with the team code can change everything, so keep it to the team.

### Basic and secure mode

The app works with the Firebase project as it is and picks the mode by itself:

- **Basic** (the original open rules, nothing to set up): the phone checks the code and remembers it, like the first version. Codes saved by the first version keep working. The database itself stays open, so someone tech-savvy could read the codes or change data.
- **Secure** (Anonymous sign-in turned on and `firestore.rules` published): joining signs the phone in anonymously (no account or password) and the database checks the code, so the codes never reach a browser and only members can change anything.

To switch from basic to secure, whoever owns the Firebase project does two things, in this order:

1. **Authentication → Sign-in method** → enable **Anonymous**.
2. Publish the rules: paste `firestore.rules` into Firestore's **Rules** tab, or run `npx firebase-tools deploy --only firestore:rules --project <your-project-id>`.

The app notices right away. Everyone taps **Join** once more (their code is already filled in) and picks their name again.

## Setup (new Firebase project)

1. Create a project at <https://console.firebase.google.com>, add a **Web app**, and enable **Firestore Database**.
2. In **Authentication → Sign-in method**, enable **Anonymous**.
3. Publish the rules: paste `firestore.rules` into Firestore's **Rules** tab, or run `npx firebase-tools deploy --only firestore:rules --project <your-project-id>`.
4. `cp .env.example .env` and fill in the four `VITE_FIREBASE_*` values from the web app config.
5. With Node 24.12 or newer: `npm install` then `npm run dev`.
6. Open the app, tap **Join → Setting up the app for a new team?** and pick the team name and codes.

## Upgrading from the first version

Nothing to set up: merge to `main` and the new version deploys in basic mode. Existing data keeps working. Old games show up as results, old stats count minutes as "not tracked", existing votes still count, the group code becomes the **team code** and the viewer code becomes the **fan code**. Everyone's saved code keeps working, so nobody has to join again.

The first teammate to open the new version also adds the upcoming league games (Nov 4 and Nov 11) and names the team "John Wall". Both can be changed in the app.

Switching to secure mode later is optional (see above). Don't publish the new rules while the first version is still the one deployed: it can't sign in, so it would stop working.

## Deploy (GitHub Pages)

Add the four `VITE_FIREBASE_*` values as repository secrets, set Pages source to "GitHub Actions", and push to `main`. `.github/workflows/deploy.yml` runs the tests, then builds and publishes.

## Development

- `npm test`: unit tests for the stat math (`tests/`).
- `npm run emulators` in one terminal and `npm run dev:local` in another: run the app against local Firebase emulators (needs Java) instead of the real project.
- `npm run test:rules`: tests `firestore.rules` against the Firestore emulator (needs Java).

The UI is plain JavaScript rendered with [lit-html](https://lit.dev/docs/libraries/standalone-templates/), which only updates what changed, so typing isn't wiped when someone else's update arrives.

## Data

- `config/group`: the team and fan codes (team members only). `config/public`: team name.
- `members/{uid}`: who joined on which device, their role, and their player.
- `players`, `awardCategories`, `injuries`.
- `games/{id}`: `status` is `scheduled`, `live` or `final` (games from the first version have no status and count as final). Subcollections `stats/{playerId}`, `rsvps/{playerId}` and `votes/{voterId}_{categoryId}`.

## Notes

- Ties can't be saved: one team has to win.
- The +1/+2/+3 buttons cover both 1s-and-2s and 2s-and-3s scoring.
- Live minutes count game-clock time on the court, so stopping the clock stops everyone's minutes.
