# Crop — Direct Manipulation Spec

Crop should not look like a tool page. Users already understand crop.

Tap Crop:
- editor chrome withdraws;
- current media remains in place;
- crop frame appears over the media;
- user pans/zooms image directly;
- grid appears subtly during manipulation;
- Reset and Done remain.

For Look, crop stays attached to the selected object. For Poster, the stage ratio already defines the crop target. Aspect-ratio choices are advanced, not default.

Handles should be optically thin and high-contrast without huge brand-colored knobs. Done commits one history entry; Cancel restores the exact previous state.

Promote `InCanvasCropOverlay` to the canonical path and retire mainstream use of the separate `CreatorCropSheet` once parity is complete.
