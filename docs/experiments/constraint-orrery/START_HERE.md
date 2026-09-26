# Warhammer dice geometry — start here

Explore how a few Warhammer stat values can generate visible geometry: two values on perpendicular axes, a family of lines between their ticks, a curved envelope, and eventually three related face constructions constraining one 3D form. Then examine how the game maps those relationships down into Hit, Wound, and Save dice requirements.

This is the recovered working question. An accurate internal spheroid is a proposed outcome to investigate, not a result already established by the old project.

## The picture to preserve

1. **One pair.** Put Strength and Toughness on perpendicular axes. Begin with your examples: 10 versus 10, then 13 versus 8. Give both axes the same number of intervals, with spacing determined by their lengths.
2. **One face.** Connect corresponding ticks in opposite order: move down one axis while moving out along the other. Inspect the curved boundary suggested by the straight lines. Change one value and watch the construction change. Use “strain” informally for that change in shape; no special strain formula is required yet.
3. **Three faces.** Explore Hit, Wound, and Save as three pair-based constructions on mutually perpendicular faces meeting at a corner of a rectangular cuboid. Keep the two local axes visible on every face.
4. **An interior.** Ask what 3D surface, if any, can satisfy all three face constructions. Try a candidate, then check whether its chosen sections or projections reproduce the face curves.
5. **The dice connection.** Keep the input values and their shapes visible alongside the selected D6 faces. A required 4+ selects {4, 5, 6}; a percentage can be a final readout. The shape-to-rule connection must be specified and tested.

“Rectangular cuboid” is the name for the box you described. The box is the frame; the possible curved form inside it is a separate object.

## What we have, and what remains open

| Space | Starting material from the conversation | Still to decide |
|---|---|---|
| Wound | Strength and Toughness; the explicit tick construction | How the curve relates to the wound rule |
| Save | Armour Penetration and Save were proposed | How signed/zero AP and save thresholds become meaningful geometric coordinates |
| Hit | Attack skill / hit requirement was named | The second coordinate of the proposed pair; it was never settled |

Three small points keep the experiment honest:

- The usual complementary, evenly spaced tick construction has a **parabolic envelope**, including when the axis lengths match. Symmetry alone does not make a circle. Draw the actual construction before naming its shape.
- Three faces of one cuboid share edges. Three unrelated pairs supply six local axis values; joining them requires an explicit mapping to the three shared directions. A diagram may place them on faces before that mapping is settled, but it is then a layout experiment.
- Face curves do not generally determine a unique interior. Choose whether they are sections, silhouettes, or other constraints, then test a reconstruction rule. A spheroid or ellipsoid can be a candidate; it should not be inserted automatically.

## The smallest next experiment

Draw the 10:10 and 13:8 Strength–Toughness constructions side by side, with identical tick counts and a common display scale. Show the original lines and the resulting envelope. Change only Strength. Record what changes in the geometry and, separately, what changes in the chosen wound rule.

This gives us one face we actually understand before attempting the three-face reconstruction. A one-face drawing alone does not complete that reconstruction. Different drawings can also share the same dice requirement; that difference is something to investigate, not evidence of an extra game effect.

## Keep the working scope this small

Keep real Warhammer names and a handful of example values. Keep the proposed three-face reconstruction visible as the destination. Keep the selected D6 faces as the link back to the game. Check current rules when applying this to actual tournament profiles; the old conversation is a historical source.

Set aside full army lists, list holes, expected-damage engines, victory points, movement, deployment, fiber bundles, generalized type systems, proxy factions, hackathon requirements, hosting, and software architecture. They are outside this experiment.

Read [ORIGINAL_WORDS.md](ORIGINAL_WORDS.md) when you want to check the source. [NEXT_MODEL_ASSESSMENT.md](NEXT_MODEL_ASSESSMENT.md) is an additional candid handoff addressed to a future model; it distinguishes interpretation, evidence, and unresolved questions. The older material remains under `archive/` and is not required reading.
