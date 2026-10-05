import { createContext, useContext } from 'react';

/** Список и задача видны рядом (широкий экран, режим «список»): кнопка «Назад» в карточке не нужна. */
export const SplitContext = createContext(false);

export const useSplitView = () => useContext(SplitContext);
