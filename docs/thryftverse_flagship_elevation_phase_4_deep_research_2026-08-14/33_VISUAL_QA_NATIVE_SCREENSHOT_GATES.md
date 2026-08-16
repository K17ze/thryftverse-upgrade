# Native visual QA and screenshot gates

This is a blocking deliverable for claiming flagship completion.

## Required golden routes

1. Home
2. Explore
3. Global Search idle
4. Global Search results
5. Visual Search
6. Closet Saved
7. Collection Detail
8. Product Detail normal
9. Product Detail luxury/trust
10. Sell media
11. Sell review
12. Auction Home Live
13. Auction Detail Live
14. Co-Own Hub
15. Galleria
16. Co-Own Asset Detail
17. Due Diligence
18. My Profile
19. Public Profile
20. Inbox
21. Chat
22. Agent approval state
23. Connections
24. Poster camera
25. Poster editor
26. Poster viewer
27. Look editor
28. Wallet
29. Convert review
30. Checkout
31. Order detail
32. Settings
33. Notifications
34. Seller Analytics

## Variants
At minimum:
- iOS light/dark;
- Android light/dark;
- 360dp narrow;
- large text;
- Reduce Motion relevant flows.

## Optical review rubric
Score 0–2 each:
- dominant subject;
- hierarchy;
- content/chrome ratio;
- spacing rhythm;
- typography;
- media crop;
- control density;
- material discipline;
- copy economy;
- state truth;
- platform fit;
- accessibility.

No flagship sign-off under 20/24 on a key screen.

## Diff review
Pixel diff is only a regression detector.
A human must still review:
- wrong crop;
- awkward line break;
- competing actions;
- synthetic card repetition;
- visual monotony;
- empty negative space;
- keyboard/gesture state.

## Baseline rule
Missing baseline = release gate failure for listed flagship route.
