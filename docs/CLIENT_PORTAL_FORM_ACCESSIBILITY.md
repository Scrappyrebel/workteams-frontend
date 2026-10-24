# WorkTeams Client Portal — keyboard and small-screen form improvements

The location bearer-link portal has named controls for signing an amendment, requesting extra service/temp staff, confirming hours, and contacting the business. Each submission form announces busy state. Category radios remain visible/keyboard-reachable rather than hidden with display:none; form rows wrap on narrow screens. The existing action mutex, location-scoped queries and privacy-safe status history are unchanged.

This static regression validates the critical semantics and preservation of token boundaries; a real phone test (TalkBack, VoiceOver, keyboard navigation, signing, send/retry) remains required before describing the accessibility milestone as complete.
