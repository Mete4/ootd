import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import OutfitBuilder from '../components/OutfitBuilder';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { showToast } from '../store/useToast';
import { formatDate } from '../utils/format';
import { C, R, T } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';

export default function OutfitBuilderScreen() {
  const navigation = useNavigation();
  const route = useRoute() as any;
  const { clothingItems, outfits, updateOutfit, addOutfit, hierarchyCats, vacationMode, vacationItemIds, setVacationMode } = useStore();

  const editingOutfit = route.params?.editingOutfit;
  const initialDate = route.params?.initialDate || new Date().toISOString();
  /** Set by "Build Outfit With This" on an item screen. */
  const seedItemIds: string[] = route.params?.seedItemIds || [];

  const [outfitDate, setOutfitDate] = useState(editingOutfit ? editingOutfit.dateWorn : initialDate);
  const [itemIds, setItemIds] = useState<string[]>(
    editingOutfit ? [...editingOutfit.itemIds] : seedItemIds
  );
  const [logModal, setLogModal] = useState(false);
  const [outfitName, setOutfitName] = useState(editingOutfit?.name || '');
  const [outfitNote, setOutfitNote] = useState(editingOutfit?.note || '');
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const handleSave = () => {
    if (itemIds.length === 0) {
      setLogModal(false);
      showToast('Pick at least one item first');
      return;
    }

    const data = {
      itemIds,
      dateWorn: outfitDate,
      name: outfitName.trim() || undefined,
      note: outfitNote.trim() || undefined,
    };

    if (editingOutfit) {
      updateOutfit({ ...editingOutfit, ...data });
      showToast('Outfit updated');
    } else {
      addOutfit({
        ...data,
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        isFavorite: false,
      });
      showToast(`Logged ${itemIds.length} item${itemIds.length === 1 ? '' : 's'} for ${formatDate(outfitDate)}`);
    }
    setLogModal(false);
    navigation.goBack();
  };

  const activeDate = new Date(outfitDate);
  const dateStr = formatDate(activeDate);

  const handleDateConfirm = (date: Date) => {
    setOutfitDate(date.toISOString());
    setDatePickerVisible(false);
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={elements.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={ICON_SIZE.back} color={C.primary} />
        </TouchableOpacity>
        <Text style={elements.screenTitle} accessibilityRole="header">{editingOutfit ? 'Edit Outfit' : 'Build Outfit'}</Text>
      </View>

      <OutfitBuilder
        clothingItems={clothingItems}
        outfits={outfits}
        currentSelection={itemIds}
        setSelection={setItemIds}
        hierarchyCats={hierarchyCats}
        onLogPress={() => setLogModal(true)}
        logBtnText={editingOutfit ? 'Update Outfit' : 'Save Outfit'}
        vacationItemIds={vacationMode ? vacationItemIds : null}
        onExitVacation={() => setVacationMode(false)}
      />

      <Modal visible={logModal} animationType="slide" transparent onRequestClose={() => setLogModal(false)}>
        <View style={elements.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setLogModal(false)}
            accessibilityLabel="Close"
          />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={elements.sheet}>
              <View style={elements.grabber} />
              <View style={elements.sheetHeading}>
                <Text style={elements.sheetTitle} accessibilityRole="header">Finalize Outfit</Text>
                <Text style={elements.sheetHint}>
                  {itemIds.length} item{itemIds.length === 1 ? '' : 's'} selected
                </Text>
              </View>

              <View style={elements.field}>
                <Text style={elements.fieldLabel}>Date</Text>
                <TouchableOpacity
                  style={s.dateTrigger}
                  onPress={() => setDatePickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Date, ${dateStr}. Tap to change.`}
                >
                  <Ionicons name="calendar-outline" size={20} color={C.accent} />
                  <Text style={s.dateTriggerText}>{dateStr}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.secondary} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>

              <View style={elements.field}>
                <Text style={elements.fieldLabel}>Name (optional)</Text>
                <TextInput
                  style={elements.textInput}
                  placeholder="e.g. Morning Jog"
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
                  placeholder="Notes..."
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
                  style={[elements.filledButton, itemIds.length === 0 && elements.disabled]}
                  onPress={handleSave}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: itemIds.length === 0 }}
                  accessibilityLabel={editingOutfit ? 'Update outfit' : 'Save outfit'}
                >
                  <Text style={elements.filledButtonText}>{editingOutfit ? 'Update Outfit' : 'Save Outfit'}</Text>
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
  dateTrigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.main, borderRadius: R.control, borderWidth: 1, borderColor: C.subtle, padding: 13, gap: 12 },
  dateTriggerText: { color: C.primary, fontSize: T.body, fontWeight: '600' },
});
