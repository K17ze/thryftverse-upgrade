export const Motion = {
  spring: {
    pressRelease: {
      damping: 18,
      stiffness: 420,
    },
    flagship: {
      damping: 16,
      stiffness: 260,
    },
    flagshipPop: {
      damping: 14,
      stiffness: 300,
    },
  },
  timing: {
    pressIn: 85,
    pressOut: 110,
    focus: 180,
  },
  list: {
    enterDuration: 360,
    staggerStep: 45,
    maxStaggerItems: 10,
  },
  navigation: {
    pushOpenDuration: 220,
    pushCloseDuration: 180,
    modalOpenDuration: 220,
    modalCloseDuration: 180,
  },
} as const;
