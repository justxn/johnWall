# Intramural Hoops

Shared stats tracker for our intramural basketball team: game results (W/L), per-player points/rebounds/assists, and per-game award voting (MVP plus custom awards).

Rebounds and assists can be left blank for games where they weren't tracked. They show as "—" and are left out of averages (not counted as 0).

## Setup

1. Create a project at <https://console.firebase.google.com>, add a **Web app**, and enable **Firestore Database**.
2. Paste the contents of `firestore.rules` into Firestore's Rules tab and publish.
3. `cp .env.example .env` and fill in the four `VITE_FIREBASE_*` values from the web app config.
4. `npm install` then `npm run dev`.
5. The first person to open the site picks the **group code**. Share it with friends.

## Deploy (GitHub Pages)

Add the four `VITE_FIREBASE_*` values as repository secrets, set Pages source to "GitHub Actions", and push to `main`. `.github/workflows/deploy.yml` builds and publishes.

## Notes

- The group code and name picker are a convenience, not security. The rules are open, so anyone with the Firebase config could write to the database. Fine for a friend group.
- Ties aren't supported when saving a game.
