// Render layers. The cameras that draw the picture see layer 0 only; a shadow-casting
// light's shadow camera also sees SHADOW_ONLY, so a mesh put on that layer alone casts
// its shadow without being sent through the main pass at all (an invisible mesh there
// still costs every one of its triangles).

export const SHADOW_ONLY = 7;
