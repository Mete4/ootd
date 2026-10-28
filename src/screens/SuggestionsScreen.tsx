import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStore, ClothingItem } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { resolveImageUri } from '../utils/media';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '../store/useToast';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatDate, formatTime } from '../utils/format';
import { C, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge } from '../components/ItemPhotoBadges';
import { confirm } from '../utils/confirm';

export default function SuggestionsScreen() {
  const navigation = useNavigation() as any;
  const { shareToken, shareSecret, clothingItems, addOutfit, deleteOutfit, markSuggestionsViewed } = useStore();
  const wear = useWearIndex();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('HomeMain');
    }
  };

  useEffect(() => {
    if (!shareToken) {
      setLoading(false);
      return;
    }

    markSuggestionsViewed(shareToken, new Date().toISOString());
    void fetchSuggestions();
    // No live updates: the server shows suggestions only to the owner, through
    // list_suggestions. Pull down to check for new ones.
  }, [shareToken]);

  /** Reads the suggestions of the link. The server checks the owner secret. */
  const fetchSuggestions = async ({ isRefresh = false } = {}) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('list_suggestions', {
      p_token: shareToken,
      p_secret: shareSecret,
    });

    if (err) {
      setError(err.message);
    } else if (data) {
      setSuggestions(data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  /**
   * Removes the row on the server. Only the closet owner can do this, which the
   * database checks against the share secret.
   */
  const removeOnServer = async (id: string) => {
    const { error: err } = await supabase.rpc('delete_suggestion', {
      p_id: id,
      p_secret: shareSecret,
    });
    if (err) throw new Error(err.message);
  };

  /**
   * Accepting logs the outfit and drops the suggestion.
   *
   * Undo only takes the outfit back, because the suggestion is gone from the
   * server by then. The toast says so rather than promising a full reversal.
   */
  const handleAccept = async (suggestion: any) => {
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    addOutfit({
      id,
      dateWorn: new Date().toISOString(),
      itemIds: suggestion.item_ids,
      isFavorite: false,
      name: `Suggested by ${suggestion.suggested_by || 'Friend'}`,
    });

    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    try {
      await removeOnServer(suggestion.id);
    } catch (e: any) {
      showToast(`Logged, but the suggestion stayed on the server: ${e.message}`);
      void fetchSuggestions();
      return;
    }

    showToast('Logged for today. The suggestion is gone.', {
      label: 'Undo outfit',
      onPress: () => deleteOutfit(id),
    });
  };

  /** Dismissing is permanent, so it asks first. */
  const handleDismiss = (suggestion: any) => {
    const who = suggestion.suggested_by || 'your friend';
    confirm(
      'Dismiss this suggestion?',
      `The outfit ${who} sent is deleted for good. You cannot undo this.`,
      async () => {
        const restore = suggestions;
        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        try {
          await removeOnServer(suggestion.id);
          showToast('Suggestion dismissed');
        } catch (e: any) {
          setSuggestions(restore);
          showToast(`Could not dismiss it: ${e.message}`);
        }
      },
      { confirmLabel: 'Dismiss', destructive: true }
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const matchedItems: ClothingItem[] = (item.item_ids || [])
      .map((id: string) => clothingItems.find(c => c.id === id))
      .filter((i: ClothingItem | undefined): i is ClothingItem => !!i);

    return (
      <View style={[elements.card, s.card]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.suggestedBy}>{item.suggested_by || 'Anonymous Friend'}</Text>
            <Text style={s.date}>{formatDate(item.created_at)} · {formatTime(item.created_at)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDismiss(item)}
            hitSlop={hitSlopFor(ICON_SIZE.header)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss this suggestion"
          >
            <Ionicons name="close" size={ICON_SIZE.header} color={C.secondary} />
          </TouchableOpacity>
        </View>

        <View style={s.imagesGrid}>
          {matchedItems.map((cItem, idx) => (
            <TouchableOpacity
              key={`${item.id}-${cItem.id}-${idx}`}
              style={elements.thumbnail}
              onPress={() => navigation.navigate('ItemDetails', { id: cItem.id })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${cItem.name || cItem.subCategory}, item ${wear.numberOf(cItem.id)}`}
            >
              {cItem.imageUri
                ? <Image source={{ uri: resolveImageUri(cItem.imageUri) }} style={s.itemImage} />
                : <Ionicons name="shirt-outline" size={18} color={C.subtle} />}
              <ItemNumberBadge itemNumber={wear.numberOf(cItem.id)} />
            </TouchableOpacity>
          ))}
          {matchedItems.length === 0 && (
            <Text style={s.gone}>These items are no longer in your closet.</Text>
          )}
        </View>

        <TouchableOpacity
          style={[elements.filledButton, s.acceptBtn, matchedItems.length === 0 && elements.disabled]}
          onPress={() => handleAccept(item)}
          disabled={matchedItems.length === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: matchedItems.length === 0 }}
          accessibilityLabel="Accept this outfit and log it for today"
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={C.main} />
          <Text style={elements.filledButtonText}>Accept Outfit</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <TouchableOpacity
          onPress={goHome}
          style={elements.backButton}
          hitSlop={hitSlopFor(40)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={ICON_SIZE.back} color={C.primary} />
        </TouchableOpacity>
        <Text style={elements.screenTitle} accessibilityRole="header">Suggestions</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={elements.emptyState}>
          <Ionicons name="cloud-offline-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>Could not load suggestions</Text>
          <Text style={elements.emptyText}>{error}</Text>
          <TouchableOpacity style={elements.pillButton} onPress={() => fetchSuggestions()} accessibilityRole="button">
            <Text style={elements.pillButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={elements.emptyState}>
          <Ionicons name="mail-open-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
          <Text style={elements.emptyTitle}>No suggestions yet</Text>
          <Text style={elements.emptyText}>Share your closet link with friends to get outfit ideas.</Text>
          <TouchableOpacity style={elements.pillButton} onPress={() => fetchSuggestions()} accessibilityRole="button">
            <Text style={elements.pillButtonText}>Check again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={refreshing}
          onRefresh={() => fetchSuggestions({ isRefresh: true })}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  card: { marginBottom: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  suggestedBy: { color: C.primary, fontSize: T.body, fontWeight: '700' },
  date: { color: C.secondary, fontSize: T.caption, marginTop: 2 },
  imagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  itemImage: { width: '100%', height: '100%' },
  gone: { color: C.secondary, fontSize: T.footnote },
  // The only button in the card, so it does not share a row with another.
  acceptBtn: { flex: 0 },
});
