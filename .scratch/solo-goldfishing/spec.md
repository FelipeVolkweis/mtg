# Solo Match Goldfishing

## Goal

Let a Room Participant test a Decklist alone using the same Manual Match flow as multiplayer play.

## Decisions

- Every Room can host a Solo Match.
- A Solo Match has exactly one Match Player: the sole ready participant who starts it.
- The lobby shows a separate **Start solo Match** action only to that ready participant while exactly one participant is ready. Multiplayer **Start Match** continues to require two to four ready participants.
- Solo start uses the selected saved Decklist and the lobby's starting-life value, then creates the normal Manual Match state.
- Every Room Participant can observe the Solo Match. Participants who are not its Match Player cannot change its Match state.
- With no active Match, solo start begins immediately. With an active Match, it uses the existing replacement request: all current Match Players must be connected and confirm before the active Match is replaced.
- The ready message explains that one ready participant can start a Solo Match and that other guests wait for the next Match.
