import { createContext, useContext } from "react";

/**
 * Single source of truth for the currently active slide index.
 * Only the Swiper `slideChange` handler writes to it.
 */
export const ActiveSlideContext = createContext<number>(0);

export const useActiveSlide = () => useContext(ActiveSlideContext);

/** True only when the given slide index is the active one. */
export const useIsSlideActive = (index?: number) => {
  const active = useActiveSlide();
  return index === undefined ? true : index === active;
};
