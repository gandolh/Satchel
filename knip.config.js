import preset from "./vendor/house-style/knip.json" with { type: "json" };

// knip has no `extends`, so this spreads the house preset. Satchel adds the entries knip can't find on its
// own: the docs capture helper and the check:fast script, both run by hand.
export default {
  ...preset,
  workspaces: { ".": { entry: ["docs/images/*.mjs", "scripts/*.mjs"] } },
};
