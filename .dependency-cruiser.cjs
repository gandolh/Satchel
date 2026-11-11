// The house dependency-cruiser preset, from the vendored house-style copy: no cycles, no unresolvable
// imports, a feature used through its index only, no Fastify in lib/. A rule of the same name here
// replaces the preset's; Satchel changes none.
module.exports = {
  extends: "./vendor/house-style/.dependency-cruiser.cjs",
};
