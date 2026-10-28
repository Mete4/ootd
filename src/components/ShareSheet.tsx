import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator,
  Share, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useStore, VACATION_SHARE_DAYS } from '../store/useStore';
import { useShareSheet } from '../store/useShare';
import { syncClosetToCloud, shareUrlFor, type ShareScope } from '../utils/sync';
import { showToast } from '../store/useToast';
import { plural, expiryLabel } from '../utils/format';
import { C, R, T, hitSlopFor } from '../theme';
import { elements } from '../elementStyles';

type Stage = 'idle' | 'working' | 'ready' | 'error';

const COPY: Record<ShareScope, { title: string; blurb: string; expiryRule: string }> = {
  full: {
    title: 'Share Closet',
    blurb: 'Anyone with the link sees your closet and can send you outfit ideas.',
    expiryRule: 'Never expires. You can make a new link at any time.',
  },
  vacation: {
    title: 'Share Packing List',
    blurb: 'Anyone with the link sees only what you packed, and can send you outfit ideas.',
    expiryRule: `Deletes itself after ${VACATION_SHARE_DAYS} days.`,
  },
};

/**
 * The one place a share link is made, read and sent.
 *
 * Mounted once at the root, next to the toast host. Two reasons:
 *
 * 1. An upload takes as long as it takes. The sheet has to be closable while it
 *    runs, and a component that unmounts would drop the progress and leave the
 *    user with no way back to it. Rendered at the root, the job survives a
 *    closed sheet and every tab change.
 * 2. Only one share can run at a time, which stops the Closet and the Vacation
 *    screen from starting two uploads that fight over the same photos.
 */
export default function ShareSheet() {
  const visible = useShareSheet(s => s.visible);
  const scope = useShareSheet(s => s.scope);
  const close = useShareSheet(s => s.close);
  const setScope = useShareSheet(s => s.setScope);

  // Read narrowly. This component is mounted for the life of the app, so a
  // whole-store subscription would re-render the root on every item edit.
  const shareToken = useStore(st => st.shareToken);
  const hasShareSecret = useStore(st => !!st.shareSecret);
  const vacationShare = useStore(st => st.vacationShare);
  const fullCount = useStore(st => st.clothingItems.filter(i => !i.archived).length);
  const packedCount = useStore(st => {
    const ids = new Set(st.vacationItemIds);
    return st.clothingItems.filter(i => !i.archived && ids.has(i.id)).length;
  });

  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [summary, setSummary] = useState('');
  /** Which link the running job belongs to, so the other scope stays readable. */
  const [jobScope, setJobScope] = useState<ShareScope>('full');

  const packing = scope === 'vacation';
  const copy = COPY[scope];
  const count = packing ? packedCount : fullCount;
  const token = packing ? vacationShare?.token ?? null : shareToken;
  const url = token ? shareUrlFor(token) : null;
  // A link from an older version of the app, which no update has reached yet.
  // It still shows the closet as it was then, archived items included.
  const isOldLink = !!token && !(packing ? !!vacationShare?.secret : hasShareSecret);
  const busy = stage === 'working';
  const busyHere = busy && jobScope === scope;

  const expiryLine = packing
    ? vacationShare
      ? expiryLabel(vacationShare.expiresAt)
      : copy.expiryRule
    : copy.expiryRule;

  const run = async () => {
    const st = useStore.getState();
    const scopeItems = packing
      ? st.clothingItems.filter(i => st.vacationItemIds.includes(i.id))
      : st.clothingItems;

    if (scopeItems.filter(i => !i.archived).length === 0) {
      showToast(packing
        ? 'Pack some clothes before you share your trip'
        : 'Add some items before you share your closet');
      return;
    }

    setJobScope(scope);
    setStage('working');
    setErrorMsg('');
    setProgress('Starting...');

    try {
      const result = await syncClosetToCloud({
        scope,
        token: packing ? vacationShare?.token ?? null : st.shareToken,
        secret: packing ? vacationShare?.secret ?? null : st.shareSecret,
        items: scopeItems,
        clothingItems: st.clothingItems,
        outfits: st.outfits,
        ttlDays: packing ? VACATION_SHARE_DAYS : null,
        knownFingerprints: st.uploadedFingerprints,
        onUploaded: st.rememberUpload,
        onShareOwned: (ownedToken, ownedSecret) => {
          if (packing) {
            // save_share moves the expiry this far ahead on every update.
            const expiresAt = new Date(Date.now() + VACATION_SHARE_DAYS * 86400_000).toISOString();
            st.setVacationShare({ token: ownedToken, secret: ownedSecret, expiresAt });
          } else {
            st.setShare(ownedToken, ownedSecret);
          }
        },
        onPhotoDeleted: st.forgetUpload,
        onProgress: setProgress,
      });

      const parts = [`${plural(result.uploaded, 'photo')} sent`];
      if (result.skipped > 0) parts.push(`${result.skipped} already up to date`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.deletedPhotos > 0) parts.push(`${plural(result.deletedPhotos, 'old photo')} deleted`);
      if (result.isPhotoCleanupFailed) parts.push('old photos not deleted, try again');
      setSummary(parts.join(' · '));
      setStage('ready');
      if (result.isLinkReplaced) {
        showToast('Your old link could not be updated, so this is a new one. Send it again.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Something went wrong');
      setStage('error');
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    showToast('Link copied');
  };

  const handleSend = async () => {
    if (!url) return;
    // The system sheet is the normal way to hand a link to a person. The web
    // preview has no such sheet, so there the button copies instead.
    if (Platform.OS === 'web') {
      await handleCopy();
      return;
    }
    try {
      await Share.share({ message: url, url });
    } catch {
      await handleCopy();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={elements.sheetBackdrop}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close share"
        />

        <View style={[elements.sheet, s.sheet]}>
          <View style={elements.grabber} />

          <View style={s.titleRow}>
            <View style={s.titleIcon}>
              <Ionicons name={packing ? 'airplane' : 'link'} size={20} color={C.accent} />
            </View>
            <Text style={s.title} accessibilityRole="header">{copy.title}</Text>
            <TouchableOpacity onPress={close} hitSlop={hitSlopFor(24)} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={C.secondary} />
            </TouchableOpacity>
          </View>

          {/* Which link. Shown only when there is a packing list to choose. */}
          {packedCount > 0 && (
            <View style={[elements.segmented, s.segment]}>
              {(['full', 'vacation'] as ShareScope[]).map(opt => {
                const on = scope === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[elements.segmentedOption, s.segmentBtn, on && elements.segmentedOptionSelected]}
                    onPress={() => setScope(opt)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={opt === 'full'
                      ? `Full closet, ${plural(fullCount)}`
                      : `Packing list, ${plural(packedCount)}`}
                  >
                    <Text style={[elements.segmentedText, on && elements.segmentedTextSelected]}>
                      {opt === 'full' ? 'Full Closet' : 'Packing List'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={s.blurb}>{copy.blurb}</Text>
          <Text style={s.meta}>{plural(count)} · {expiryLine}</Text>

          {/* The link. Present the moment it exists, even mid-upload, because a
              link that is still filling up is still the right link to send. */}
          {url && (
            <View style={s.linkBox}>
              <Text style={s.linkText} numberOfLines={1} ellipsizeMode="middle" accessibilityLabel={`Your link: ${url}`}>
                {url}
              </Text>
            </View>
          )}

          {isOldLink && !busyHere && (
            <View style={s.staleRow}>
              <Ionicons name="alert-circle" size={16} color={C.accentAlt} />
              <Text style={s.staleText}>
                This link still shows your closet from an older version of the app. Update it to show your {plural(count)} as they are now.
              </Text>
            </View>
          )}

          {busyHere && (
            <View style={s.status} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.statusText}>{progress || 'Generating link...'}</Text>
                <Text style={s.statusHint}>
                  You can close this and keep using the app. The photos keep sending.
                </Text>
              </View>
            </View>
          )}

          {busy && !busyHere && (
            <Text style={s.otherBusy}>
              Your {jobScope === 'full' ? 'full closet' : 'packing list'} link is still sending. Wait for it to finish.
            </Text>
          )}

          {!busy && stage === 'ready' && jobScope === scope && summary !== '' && (
            <Text style={s.doneText}>
              <Ionicons name="checkmark-circle" size={13} color={C.accent} /> Up to date · {summary}
            </Text>
          )}

          {!busy && stage === 'error' && jobScope === scope && (
            <Text style={s.errorText}>{errorMsg}</Text>
          )}

          {/* Actions. Sending the link is the goal, so it gets the filled button. */}
          <View style={s.actions}>
            {url ? (
              <>
                <TouchableOpacity style={elements.outlineButton} onPress={handleCopy} accessibilityRole="button" accessibilityLabel="Copy link">
                  <Ionicons name="copy-outline" size={17} color={C.primary} />
                  <Text style={elements.outlineButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={elements.filledButton} onPress={handleSend} accessibilityRole="button" accessibilityLabel="Send link">
                  <Ionicons name="share-outline" size={17} color={C.main} />
                  <Text style={elements.filledButtonText}>Send</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[elements.filledButton, busy && elements.disabled]}
                onPress={busy ? undefined : run}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                accessibilityLabel={busyHere ? 'Generating link' : `Create ${packing ? 'packing list' : 'closet'} link`}
              >
                <Ionicons name="link" size={17} color={C.main} />
                <Text style={elements.filledButtonText}>{busyHere ? 'Generating...' : 'Create Link'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Refreshing an existing link is a second-order need, so it is text. */}
          {url && (
            <TouchableOpacity
              style={s.tertiary}
              onPress={busy ? undefined : run}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              accessibilityLabel="Update this link with your latest items and photos"
            >
              <Ionicons name="refresh" size={15} color={busy ? C.muted : C.accent} />
              <Text style={[s.tertiaryText, isOldLink && s.tertiaryTextStrong, busy && { color: C.muted }]}>
                {stage === 'error' && jobScope === scope
                  ? 'Try again'
                  : isOldLink ? 'Update this link now' : 'Update with latest changes'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titleIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.primary, fontSize: T.title, fontWeight: '900' },

  segment: { marginBottom: 14 },
  segmentBtn: { flex: 1 },

  blurb: { color: C.secondary, fontSize: T.footnote, lineHeight: 19 },
  meta: { color: C.muted, fontSize: T.caption, marginTop: 6 },

  linkBox: { backgroundColor: C.main, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle, padding: 14, marginTop: 14 },
  linkText: { color: C.primary, fontFamily: 'monospace', fontSize: T.footnote },

  status: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  statusText: { color: C.primary, fontSize: T.footnote, fontWeight: '600' },
  statusHint: { color: C.muted, fontSize: T.caption, marginTop: 2, lineHeight: 16 },
  staleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  staleText: { flex: 1, color: C.accentAlt, fontSize: T.caption, lineHeight: 17 },
  otherBusy: { color: C.accentAlt, fontSize: T.caption, marginTop: 14, lineHeight: 17 },
  doneText: { color: C.secondary, fontSize: T.caption, marginTop: 14 },
  errorText: { color: C.danger, fontSize: T.footnote, marginTop: 14, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },

  tertiary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, minHeight: 32 },
  tertiaryText: { color: C.accent, fontSize: T.footnote, fontWeight: '600' },
  tertiaryTextStrong: { fontWeight: '800' },
});
