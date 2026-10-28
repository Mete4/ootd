import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { showToast } from '../store/useToast';
import {
  findMissingPhotos, repairMissingPhotos, photoRepairSummary,
  isPhotoRepairSupported, type PhotoRepairProgress,
} from '../utils/photoRepair';
import { C, T } from '../theme';

type Phase = 'checking' | 'repairing' | 'ready';

/**
 * Holds the app back for a one-time photo repair, when one is needed.
 *
 * It holds the app back, and does not repair behind it, because an image that
 * failed to load does not try again when its file appears later. Screens that
 * stay mounted, such as Home, would keep showing blank cards until a restart.
 *
 * On every normal launch the check takes a few milliseconds and nothing shows.
 */
export default function PhotoRepairGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>(isPhotoRepairSupported ? 'checking' : 'ready');
  const [progress, setProgress] = useState<PhotoRepairProgress>({ done: 0, total: 0 });

  useEffect(() => {
    if (!isPhotoRepairSupported) return;
    let cancelled = false;
    let started = false;

    const start = () => {
      if (started) return;
      started = true;

      // A repair must never be the reason the app does not open.
      let missing;
      try {
        missing = findMissingPhotos(false);
      } catch (e) {
        console.log('Photo check failed', e);
        setPhase('ready');
        return;
      }
      if (missing.length === 0) {
        setPhase('ready');
        return;
      }
      setPhase('repairing');
      repairMissingPhotos(missing, p => { if (!cancelled) setProgress(p); })
        .then(result => showToast(photoRepairSummary(result)))
        .catch(e => showToast(`Photo repair stopped: ${e?.message ?? e}`))
        // After a Skip this changes nothing, because the phase is already ready.
        .finally(() => { if (!cancelled) setPhase('ready'); });
    };

    // The records have to be loaded before anyone can tell which photos are
    // missing. Subscribe before checking: checking first leaves a gap where the
    // load can finish unseen, and the app would wait on a blank screen forever.
    const unsubscribe = useStore.persist.onFinishHydration(start);
    if (useStore.persist.hasHydrated()) start();
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  if (phase === 'ready') return <>{children}</>;

  // Blank while checking. It is over too fast to read, and a flash of text is worse.
  if (phase === 'checking') return <View style={s.screen} />;

  return (
    <View style={s.screen}>
      <View style={s.body}>
        <Ionicons name="images-outline" size={44} color={C.accent} />
        <Text style={s.title} accessibilityRole="header">Restoring your photos</Text>
        <Text style={s.blurb}>
          The Expo Go update moved where photos are kept. This copies them back. It only happens once.
        </Text>

        <View style={s.progressRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={C.accent} />
          <Text style={s.progressText}>
            {progress.total > 0 ? `${progress.done} of ${progress.total}` : 'Starting...'}
          </Text>
        </View>
        <View style={s.track}>
          <View style={[s.fill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} />
        </View>
      </View>

      {/* The repair keeps going after a skip. Only this screen goes away. */}
      <TouchableOpacity
        style={s.skip}
        onPress={() => setPhase('ready')}
        accessibilityRole="button"
        accessibilityLabel="Skip for now. The repair keeps going in the background."
      >
        <Text style={s.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main, justifyContent: 'center', padding: 32 },
  body: { alignItems: 'center' },
  title: { color: C.primary, fontSize: T.title, fontWeight: '900', marginTop: 16, textAlign: 'center' },
  blurb: { color: C.secondary, fontSize: T.body, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 28 },
  progressText: { color: C.primary, fontSize: T.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.elevated, marginTop: 14, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  skip: { position: 'absolute', bottom: 48, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
  skipText: { color: C.secondary, fontSize: T.body, fontWeight: '600' },
});
