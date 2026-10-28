import { StyleSheet } from 'react-native';
import { C, DIMMED_OPACITY, R, T } from './theme';

/**
 * One style for each kind of element that more than one screen shows.
 *
 * Each screen used to declare its own copy of these styles. The copies drifted
 * apart: the same pill button had five sizes, and the item number sat in a
 * different corner on different screens. Use these instead of a local copy.
 */
export const elements = StyleSheet.create({
  // ---------------------------------------------------------------- headers
  /** The top row of a screen: a back button or the title, then the actions. */
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  screenTitle: { color: C.primary, fontSize: T.large, fontWeight: '900' },
  screenSubtitle: { color: C.secondary, fontSize: T.footnote, marginTop: 2 },
  backButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.subtle,
  },
  /** An icon action in a header. 44 square, so it is easy to hit. */
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  /** Small uppercase label over a field or a group. */
  overline: { color: C.secondary, fontSize: T.micro, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  // ---------------------------------------------------------------- buttons
  /** A text action on a screen, with an accent outline. */
  pillButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: R.pill, borderWidth: 1, borderColor: C.accent,
  },
  pillButtonText: { color: C.accent, fontWeight: '700', fontSize: T.footnote },
  /** The main action of a screen, at the bottom. */
  screenButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: R.tile, backgroundColor: C.accent,
  },
  screenButtonText: { color: C.main, fontWeight: '800', fontSize: T.headline },
  /** The main action in a sheet or a card. */
  filledButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: R.control, backgroundColor: C.accent,
  },
  filledButtonText: { color: C.main, fontWeight: '700', fontSize: T.body },
  /** A second action in a sheet or a card, such as Cancel. */
  outlineButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle,
  },
  outlineButtonText: { color: C.primary, fontWeight: '700', fontSize: T.body },
  /** An action that deletes, in a sheet or a card. */
  dangerButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 16, borderRadius: R.control, borderWidth: 1, borderColor: C.danger,
  },
  dangerButtonText: { color: C.danger, fontWeight: '700', fontSize: T.body },
  disabled: { opacity: DIMMED_OPACITY },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },

  // ----------------------------------------------------------------- sheets
  sheetBackdrop: { flex: 1, backgroundColor: C.sheetBackdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8, borderTopWidth: 1, borderColor: C.subtle,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.subtle, marginBottom: 14 },
  /** Holds the sheet title and its hint, and sets the space under them. */
  sheetHeading: { gap: 4, marginBottom: 16 },
  sheetTitle: { color: C.primary, fontSize: T.title, fontWeight: '900' },
  sheetHint: { color: C.secondary, fontSize: T.caption, lineHeight: 18 },

  // ------------------------------------------------------------------ forms
  field: { marginBottom: 16 },
  fieldLabel: { color: C.secondary, fontSize: T.micro, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  textInput: {
    backgroundColor: C.main, color: C.primary, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle,
    padding: 13, fontSize: T.body,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12,
    backgroundColor: C.surface, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle,
  },
  searchInput: { flex: 1, color: C.primary, fontSize: T.body },
  /** A choice in a group of choices. */
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: R.pill, borderWidth: 1, borderColor: C.subtle, backgroundColor: C.main,
  },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.secondary, fontSize: T.footnote },
  chipTextSelected: { color: C.main, fontWeight: '700' },
  /** Two or three choices side by side, one of them on. */
  segmented: { flexDirection: 'row', backgroundColor: C.main, borderRadius: 10, padding: 3 },
  segmentedOption: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentedOptionSelected: { backgroundColor: C.elevated },
  segmentedText: { color: C.secondary, fontSize: T.footnote, fontWeight: '600' },
  segmentedTextSelected: { color: C.primary, fontWeight: '700' },

  // ------------------------------------------------------------------ cards
  card: { backgroundColor: C.surface, borderRadius: R.tile, borderWidth: 1, borderColor: C.subtle, padding: 16 },
  sectionTitle: { color: C.primary, fontWeight: '700', fontSize: T.headline },
  sectionCount: { color: C.secondary, fontWeight: '400', fontSize: T.footnote },
  /** A message with an accent edge, such as "Vacation mode". */
  accentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: R.control, borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentTint,
  },
  accentBannerText: { flex: 1, color: C.primary, fontSize: T.caption, fontWeight: '600' },
  accentBannerAction: { color: C.accent, fontSize: T.caption, fontWeight: '800' },

  // ----------------------------------------------------------------- photos
  /** The square photo of an item tile in a grid. */
  itemPhoto: {
    backgroundColor: C.dark, borderRadius: R.tile, borderWidth: 1, borderColor: C.subtle,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  itemPhotoSelected: { borderColor: C.accent, borderWidth: 2 },
  itemTitle: { color: C.primary, fontWeight: '700', fontSize: T.footnote },
  itemMeta: { color: C.secondary, fontSize: T.micro, marginTop: 2 },
  /** A small item photo in a row, for example in an outfit card. */
  thumbnail: {
    width: 64, height: 64, backgroundColor: C.dark, borderRadius: R.thumbnail, borderWidth: 1, borderColor: C.subtle,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumbnailLabel: { color: C.secondary, fontSize: T.micro, textAlign: 'center', marginTop: 2 },

  // ------------------------------------------------------------ empty state
  emptyState: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: C.primary, fontWeight: '700', fontSize: T.headline, textAlign: 'center' },
  emptyText: { color: C.secondary, fontSize: T.footnote, lineHeight: 20, textAlign: 'center' },
});

/** Icon sizes for each kind of element. */
export const ICON_SIZE = {
  /** An icon action in a header, and the icons of an outfit card. */
  header: 22,
  /** The arrow in a back button. */
  back: 24,
  /** The icon in a pill button or a chip. */
  pill: 16,
  /** The large icon of an empty state. */
  emptyState: 48,
  /** The placeholder in an item photo that has no photo. */
  photoPlaceholder: 24,
};
