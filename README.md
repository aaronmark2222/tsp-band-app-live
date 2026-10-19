# TSP Work — The String Project

This repository contains only the public frontend used by TSP Work, the live band workspace. The source-of-truth project, database migrations, and internal setup documentation remain in the private `tsp-band-app` repository.

The app uses Supabase Authentication and a publishable browser key. Song data is fetched only after sign-in; Supabase row-level security controls access and task updates.
