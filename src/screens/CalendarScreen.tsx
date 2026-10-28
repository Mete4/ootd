import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, ClothingItem } from '../store/useStore';
import { useNavigation, useRoute } from '@react-navigation/native';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { confirm } from '../utils/confirm';
import { showToast } from '../store/useToast';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatDateLong, formatMonthYear } from '../utils/format';
import { C, T, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import OutfitCard from '../components/OutfitCard';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { outfits, clothingItems, updateOutfit, deleteOutfit, addOutfit } = useStore();
  const navigation = (useNavigation as any)();
  const route = useRoute() as any;
  const wear = useWearIndex();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  React.useEffect(() => {
    if (route.params?.selectedDate) {
      const d = new Date(route.params.selectedDate);
      setSelectedDate(d);
      setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [route.params?.selectedDate]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = useMemo(
    () => [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))],
    [firstDay, daysInMonth, year, month]
  );

  /**
   * One pass over the outfits gives every day that holds a record.
   * The old code called `outfits.some(...)` inside each of the 42 cells.
   */
  const loggedDays = useMemo(() => {
    const set = new Set<string>();
    outfits.forEach(o => set.add(new Date(o.dateWorn).toDateString()));
    return set;
  }, [outfits]);

  const monthLabel = formatMonthYear(currentDate);
  const selectedStr = selectedDate.toDateString();
  const todayStr = new Date().toDateString();
  const dayOutfits = useMemo(
    () => outfits.filter(o => new Date(o.dateWorn).toDateString() === selectedStr),
    [outfits, selectedStr]
  );

  const confirmDelete = (outfit: any) => {
    confirm(
      'Delete Outfit',
      'Remove this outfit record?',
      () => {
        deleteOutfit(outfit.id);
        showToast('Outfit deleted', { label: 'Undo', onPress: () => addOutfit(outfit) });
      },
      { confirmLabel: 'Delete', destructive: true }
    );
  };

  const toggleFavorite = (outfit: any) => {
    updateOutfit({ ...outfit, isFavorite: !outfit.isFavorite });
    showToast(outfit.isFavorite ? 'Removed from favorites' : 'Added to favorites');
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={[elements.screenHeader, s.titleRow]}>
        <Text style={elements.screenTitle} accessibilityRole="header">Calendar</Text>
        <View style={s.headerBtns}>
          <TouchableOpacity
            style={elements.pillButton}
            onPress={() => navigation.navigate('Favorites')}
            accessibilityRole="button"
            accessibilityLabel="Open favorite outfits"
          >
            <Ionicons name="heart-outline" size={16} color={C.accent} />
            <Text style={elements.pillButtonText}>Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={elements.pillButton}
            onPress={() => navigation.navigate('OutfitHistory')}
            accessibilityRole="button"
            accessibilityLabel="Open outfit history"
          >
            <Ionicons name="list-outline" size={16} color={C.accent} />
            <Text style={elements.pillButtonText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.calWrap}>
        {/* Month Nav */}
        <View style={s.monthNav}>
          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(year, month - 1, 1))}
            hitSlop={hitSlopFor(22)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={22} color={C.primary} />
          </TouchableOpacity>
          <Text style={s.monthLabel} accessibilityRole="header">{monthLabel}</Text>
          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(year, month + 1, 1))}
            hitSlop={hitSlopFor(22)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={22} color={C.primary} />
          </TouchableOpacity>
        </View>

        {/* Day Names */}
        <View style={s.dayNamesRow}>
          {DAYS.map(d => <Text key={d} style={s.dayName}>{d}</Text>)}
        </View>

        {/* Grid */}
        <View style={s.grid}>
          {days.map((day, i) => {
            if (!day) return <View key={`pad-${i}`} style={s.dayCell} />;
            const dayStr = day.toDateString();
            const isSelected = dayStr === selectedStr;
            const isToday = dayStr === todayStr;
            const hasDot = loggedDays.has(dayStr);
            return (
              <TouchableOpacity
                key={dayStr}
                style={[s.dayCell, isSelected && s.dayCellSelected]}
                onPress={() => setSelectedDate(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatDateLong(day)}${hasDot ? ', outfit logged' : ', nothing logged'}`}
              >
                <Text style={[s.dayNum, isSelected && s.dayNumSelected, isToday && s.dayNumToday]}>
                  {day.getDate()}
                </Text>
                <View style={[s.dot, !hasDot && s.dotHidden]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected Day */}
      <ScrollView style={s.daySheet} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={[elements.overline, s.daySheetLabel]}>{formatDateLong(selectedDate)}</Text>

        {dayOutfits.length === 0 ? (
          <View style={elements.emptyState}>
            <Ionicons name="calendar-clear-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>No outfit logged</Text>
            <TouchableOpacity
              style={elements.pillButton}
              onPress={() => navigation.navigate('OutfitBuilder', { initialDate: selectedDate.toISOString() })}
              accessibilityRole="button"
              accessibilityLabel={`Log an outfit for ${formatDateLong(selectedDate)}`}
            >
              <Ionicons name="add" size={16} color={C.accent} />
              <Text style={elements.pillButtonText}>Log an outfit</Text>
            </TouchableOpacity>
          </View>
        ) : dayOutfits.map(outfit => {
          const items = outfit.itemIds
            .map(id => clothingItems.find(i => i.id === id))
            .filter((i): i is ClothingItem => !!i)
            .sort((a, b) => wear.numberOf(a.id) - wear.numberOf(b.id));

          return (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              items={items}
              numberOf={wear.numberOf}
              showsDate={false}
              onFavorite={() => toggleFavorite(outfit)}
              onEdit={() => navigation.navigate('OutfitBuilder', { editingOutfit: outfit })}
              onDelete={() => confirmDelete(outfit)}
              onItem={id => navigation.navigate('ItemDetails', { id })}
            />
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  titleRow: { justifyContent: 'space-between' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calWrap: { backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.subtle, paddingHorizontal: 12, paddingBottom: 12 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  monthLabel: { color: C.primary, fontWeight: '700', fontSize: T.headline },
  dayNamesRow: { flexDirection: 'row', marginBottom: 8 },
  dayName: { flex: 1, textAlign: 'center', color: C.secondary, fontSize: T.micro, fontWeight: '600', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: C.elevated, borderRadius: 8 },
  dayNum: { color: C.secondary, fontSize: T.body },
  dayNumSelected: { color: C.primary, fontWeight: '700' },
  dayNumToday: { color: C.accent, fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 3 },
  dotHidden: { backgroundColor: 'transparent' },
  daySheet: { flex: 1, padding: 16 },
  daySheetLabel: { marginBottom: 12 },
});
