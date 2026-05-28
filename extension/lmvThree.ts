// LMV bundles THREE on window; do not import from the npm `three` package for scene objects.

export const getLmvThree = (): typeof THREE | undefined => (window as unknown as { THREE?: typeof THREE }).THREE;
