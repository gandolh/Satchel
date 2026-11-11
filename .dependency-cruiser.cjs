// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/. A rule of the same name here
// replaces the preset's, and one is changed for Satchel.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
  forbidden: [
    {
      // A warning for now (2026-11-11): the route files import their context type from app.ts, which
      // imports them back. When each route file takes its own options type, this goes and the rule is an
      // error again.
      name: "no-circular",
      severity: "warn",
      comment: "A cycle makes load order matter and leaves no layer that can be read on its own.",
      from: {},
      to: { circular: true },
    },
  ],
};
