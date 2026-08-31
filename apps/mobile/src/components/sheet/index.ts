// One import path per sheet. Three separate ones is how a sheet ends up
// pulling two of the three and hand-rolling the third.
//
// One exception, and it is about test ergonomics, not runtime: a sheet that
// needs ONLY the header imports './sheet/SheetHeader' directly. SheetActions
// and SheetRow call usePressScaleStyle -> useReducedMotion -> settingsStore ->
// @quran-corpus/mobile-data -> expo-sqlite, so the barrel drags the settings
// store into the module graph of a sheet that draws neither, and InfoSheet.test
// and LanguageSheet.test died with `__DEV__ is not defined`. Nothing breaks in
// the app -- Metro bundles settingsStore either way.
//
// ReciterSheet.test.tsx mocks '@/settings/settingsStore' in one line instead,
// which is right for it: ReciterSheet really does render SheetRow, so it needs
// that mock regardless. A sheet that draws only a heading should not have to.
//
// Do not "tidy" those two back to the barrel.
export { SheetHeader, type SheetHeaderProps } from './SheetHeader';
export { SheetActions, type SheetActionsProps } from './SheetActions';
export { SheetRow, type SheetRowProps } from './SheetRow';
