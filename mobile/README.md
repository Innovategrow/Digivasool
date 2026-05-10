# Mobile App

This folder contains the Expo Router frontend for Rahul App.

## Screens

- `app/(tabs)/index.tsx`: parties and customer ledger overview
- `app/(tabs)/cashbook.tsx`: daily cashbook summary
- `app/(tabs)/reports.tsx`: reports and exports
- `app/(tabs)/more.tsx`: business tools and settings
- `app/add.tsx`: add transaction flow
- `app/admin.tsx`: admin-only lending view
- `app/cashbook-report.tsx`: cashbook report and duration selector

## Supporting Files

- `components/AppHeader.tsx`: shared blue app header
- `components/ActionTile.tsx`: reusable business action tiles
- `components/AdminLendingPanel.tsx`: admin lending cards
- `data/ledgerData.ts`: demo ledger records and reminder cadence
- `constants/theme.ts`: shared color tokens

## Product Behavior

- The app is now organized around Parties, Cashbook, Reports, and More.
- Staff-facing screens do not show interest rates.
- Admin-facing screens show lending interest per transaction.
- Reminder cadence is reflected in the UI as day 5, 7, 10, and 60.

## Run Locally

```bash
npm install
npx expo start --web --host lan
```

## Useful Commands

```bash
npm run web
npm run android
npm run ios
npm run lint
```

## Notes

- `expo-linear-gradient` should eventually be aligned exactly with the Expo SDK recommendation if you continue evolving the UI.
- Logs for the web build appear in the browser console once Metro is running.
