import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, TextInput, StyleSheet, Image,
  KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useStore, ClothingItem } from '../store/useStore';
import { Ionicons } from '@expo/vector-icons';
import OutfitBuilder from '../components/OutfitBuilder';
import { resolveImageUri } from '../utils/media';
import { supabase } from '../lib/supabase';
import { showToast } from '../store/useToast';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatDateLong } from '../utils/format';
import { C, R, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import { ItemNumberBadge } from '../components/ItemPhotoBadges';

import DateTimePickerModal from 'react-native-modal-datetime-picker';

export default function HomeScreen() {
  const navigation = useNavigation() as any;
  const {
    clothingItems, outfits, currentOutfitSelection, setCurrentOutfitSelection,
    addOutfit, deleteOutfit, hierarchyCats, homeDate, setHomeDate, shareToken, shareSecret,
    suggestionsLastViewedAtByToken, vacationMode, vacationItemIds, setVacationMode,
  } = useStore();

  const wear = useWearIndex();

  const [logModal, setLogModal] = useState(false);
  const [outfitName, setOutfitName] = useState('');
  const [outfitNote, setOutfitNote] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const viewedAt = shareToken ? suggestionsLastViewedAtByToken[shareToken] : undefined;

  const selectedItems = useMemo(
    () => currentOutfitSelection
      .map(id => clothingItems.find(i => i.id === id))
      .filter((i): i is ClothingItem => !!i),
    [currentOutfitSelection, clothingItems]
  );

  const confirmLog = () => {
    if (currentOutfitSelection.length === 0) {
      setLogModal(false);
      showToast('Pick at least one item first');
      return;
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const count = currentOutfitSelection.length;
    const restore = [...currentOutfitSelection];

    addOutfit({
      id,
      dateWorn: homeDate,
      itemIds: currentOutfitSelection,
      isFavorite: false,
      name: outfitName.trim() || undefined,
      note: outfitNote.trim() || undefined,
    });
    setCurrentOutfitSelection([]);
    setOutfitName('');
    setOutfitNote('');
    setLogModal(false);

    showToast(
      `Logged ${count} item${count === 1 ? '' : 's'}`,
      { label: 'Undo', onPress: () => { deleteOutfit(id); setCurrentOutfitSelection(restore); } }
    );
  };

  const activeDate = new Date(homeDate);
  const dateStr = formatDateLong(activeDate);
  const isToday = activeDate.toDateString() === new Date().toDateString();

  const handleDateConfirm = (date: Date) => {
    setHomeDate(date.toISOString());
    setDatePickerVisible(false);
  };

  // The badge counts new suggestions when Home comes into view and when the app
  // comes back to the front. The server shows them only to the owner, so there
  // are no live updates.
  useEffect(() => {
    if (!shareToken || !shareSecret) {
      setSuggestionCount(0);
      return;
    }

    let alive = true;

    const countNewSuggestions = async () => {
      const { data, error } = await supabase.rpc('count_suggestions', {
        p_token: shareToken,
        p_secret: shareSecret,
        p_since: viewedAt ?? null,
      });

      if (!alive) return;
      if (!error) {
        setSuggestionCount(data || 0);
      }
    };

    void countNewSuggestions();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      void countNewSuggestions();
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void countNewSuggestions();
    });

    return () => {
      alive = false;
      unsubscribeFocus();
      appStateSubscription.remove();
    };
  }, [navigation, shareToken, shareSecret, viewedAt]);

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      {/* Header */}
      <View style={elements.screenHeader}>
        <View style={{ flex: 1 }}>
          <Text style={elements.overline}>{isToday ? 'TODAY' : 'LOGGING FOR'}</Text>
          <View style={s.dateValueRow}>
            <TouchableOpacity
              onPress={() => setDatePickerVisible(true)}
              style={s.dateButton}
              accessibilityRole="button"
              accessibilityLabel={`Logging for ${dateStr}. Tap to change the date.`}
            >
              {/* A long date shrinks a little to stay on one line. */}
              <Text style={elements.screenTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{dateStr}</Text>
            </TouchableOpacity>

            {/* The bell only helps after the closet is shared, because a
                suggestion always arrives through a share link. */}
            {!!shareToken && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Home', { screen: 'Suggestions' })}
                style={s.suggestionsBtn}
                hitSlop={hitSlopFor(28)}
                accessibilityRole="button"
                accessibilityLabel={suggestionCount > 0
                  ? `Open suggestions, ${suggestionCount} new`
                  : 'Open suggestions'}
              >
                <Ionicons name={suggestionCount > 0 ? 'notifications' : 'notifications-outline'} size={ICON_SIZE.header} color={C.secondary} />
                {suggestionCount > 0 && (
                  <View style={s.suggestionBadge}>
                    <Text style={s.suggestionBadgeText}>{suggestionCount > 9 ? '9+' : suggestionCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
        {!isToday && (
          <TouchableOpacity
            style={elements.pillButton}
            onPress={() => setHomeDate(new Date().toISOString())}
            accessibilityRole="button"
            accessibilityLabel="Jump back to today"
          >
            <Ionicons name="today" size={ICON_SIZE.pill} color={C.accent} />
            <Text style={elements.pillButtonText}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      <OutfitBuilder
        clothingItems={clothingItems}
        outfits={outfits}
        currentSelection={currentOutfitSelection}
        setSelection={setCurrentOutfitSelection}
        hierarchyCats={hierarchyCats}
        onLogPress={() => setLogModal(true)}
        vacationItemIds={vacationMode ? vacationItemIds : null}
        onExitVacation={() => setVacationMode(false)}
      />

      {/* Save Modal */}
      <Modal visible={logModal} animationType="slide" transparent onRequestClose={() => setLogModal(false)}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setLogModal(false)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={elements.sheet}>
              <View style={elements.grabber} />
              <View style={elements.sheetHeading}>
                <Text style={elements.sheetTitle} accessibilityRole="header">Save Outfit</Text>
                <Text style={elements.sheetHint}>{dateStr}</Text>
              </View>

              {/* Preview */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, marginBottom: 20, paddingBottom: 10 }}>
                {selectedItems.map(item => (
                  <View key={item.id} style={s.previewCard}>
                    <View style={s.previewImgWrap}>
                      {item.imageUri
                        ? <Image source={{ uri: resolveImageUri(item.imageUri) }} style={{ width: '100%', height: '100%' }} />
                        : <Ionicons name="shirt-outline" size={ICON_SIZE.photoPlaceholder} color={C.subtle} />
                      }
                      <ItemNumberBadge itemNumber={wear.numberOf(item.id)} />
                    </View>
                    <Text style={s.previewName} numberOfLines={1}>{item.subCategory}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={elements.field}>
                <Text style={elements.fieldLabel}>Name (optional)</Text>
                <TextInput
                  style={elements.textInput}
                  placeholder="e.g. Work Trip"
                  placeholderTextColor={C.secondary}
                  value={outfitName}
                  onChangeText={setOutfitName}
                  accessibilityLabel="Outfit name"
                />
              </View>
              <View style={elements.field}>
                <Text style={elements.fieldLabel}>Note (optional)</Text>
                <TextInput
                  style={[elements.textInput, { height: 80 }]}
                  placeholder="Where did you go?"
                  placeholderTextColor={C.secondary}
                  multiline
                  textAlignVertical="top"
                  value={outfitNote}
                  onChangeText={setOutfitNote}
                  accessibilityLabel="Outfit note"
                />
              </View>

              <View style={elements.buttonRow}>
                <TouchableOpacity style={elements.outlineButton} onPress={() => setLogModal(false)} accessibilityRole="button">
                  <Text style={elements.outlineButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[elements.filledButton, selectedItems.length === 0 && elements.disabled]}
                  onPress={confirmLog}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedItems.length === 0 }}
                >
                  <Text style={elements.filledButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <DateTimePickerModal
        isVisible={datePickerVisible}
        mode="date"
        date={activeDate}
        onConfirm={handleDateConfirm}
        onCancel={() => setDatePickerVisible(false)}
        themeVariant="dark"
        accentColor={C.accent}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  dateValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dateButton: { flexShrink: 1 },
  suggestionsBtn: { marginLeft: 10, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  suggestionBadge: { position: 'absolute', top: -4, right: -6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  suggestionBadgeText: { color: C.primary, fontSize: T.micro, fontWeight: '800', lineHeight: 13 },
  previewCard: { width: 80, gap: 6 },
  previewImgWrap: { width: 80, height: 80, backgroundColor: C.dark, borderRadius: R.thumbnail, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.subtle },
  previewName: { color: C.primary, fontSize: T.micro, textAlign: 'center' },
});
