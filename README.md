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

Joining signs the phone in anonymously (no account or password) and Firestore's security rules check the code, so the codes never reach anyone's browser. Each phone joins once, then picks which player it belongs to. Anyone with the team code can change everything, so keep it to the team.

## Setup (new Firebase project)

1. Create a project at <https://console.firebase.google.com>, add a **Web app**, and enable **Firestore Database**.
2. In **Authentication → Sign-in method**, enable **Anonymous**.
3. Publish the rules: paste `firestore.rules` into Firestore's **Rules** tab, or run `npx firebase-tools deploy --only firestore:rules --project <your-project-id>`.
4. `cp .env.example .env` and fill in the four `VITE_FIREBASE_*` values from the web app config.
5. With Node 24.12 or newer: `npm install` then `npm run dev`.
6. Open the app, tap **Join → Setting up the app for a new team?** and pick the team name and codes.

## Upgrading from the first version

Existing data keeps working. Old games show up as results, old stats count minutes as "not tracked", existing votes still count, and the current group code becomes the **team code** (the viewer code becomes the **fan code**).

Do these in order:

1. Firebase console → **Authentication → Sign-in method** → enable **Anonymous**.
2. Merge to `main` so the new version deploys.
3. Right after it's live, publish the new `firestore.rules` (step 3 above). Until then the database is as open as before; publishing them before the new version is live would break the old one.
4. Everyone opens the app, taps **Join** (the old code is filled in) and picks their name.

The first teammate to open the new version also adds the upcoming league games (Nov 4 and Nov 11) and names the team "John Wall". Both can be changed in the app.

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
