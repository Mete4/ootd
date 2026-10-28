import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore, Outfit, ClothingItem } from '../store/useStore';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { showToast } from '../store/useToast';
import { useWearIndex } from '../hooks/useWearIndex';
import { C, hitSlopFor } from '../theme';
import { elements, ICON_SIZE } from '../elementStyles';
import OutfitCard from '../components/OutfitCard';

export default function FavoriteOutfitsScreen() {
  const navigation = useNavigation() as any;
  const { outfits, clothingItems, updateOutfit } = useStore();
  const wear = useWearIndex();

  const itemById = useMemo(() => {
    const map = new Map<string, ClothingItem>();
    clothingItems.forEach(i => map.set(i.id, i));
    return map;
  }, [clothingItems]);

  const favorites = useMemo(
    () => outfits
      .filter(o => o.isFavorite)
      .slice()
      .sort((a, b) => new Date(b.dateWorn).getTime() - new Date(a.dateWorn).getTime()),
    [outfits]
  );

  const unfavorite = (outfit: Outfit) => {
    updateOutfit({ ...outfit, isFavorite: false });
    showToast('Removed from favorites', {
      label: 'Undo',
      onPress: () => updateOutfit({ ...outfit, isFavorite: true }),
    });
  };

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <TouchableOpacity
          style={elements.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={hitSlopFor(40)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={ICON_SIZE.back} color={C.primary} />
        </TouchableOpacity>
        <View>
          <Text style={elements.screenTitle} accessibilityRole="header">Favorites</Text>
          <Text style={elements.screenSubtitle}>{favorites.length} favorite outfit{favorites.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <FlatList
        data={favorites}
        keyExtractor={o => o.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item: o }) => {
          const items = o.itemIds
            .map(id => itemById.get(id))
            .filter((i): i is ClothingItem => !!i)
            .sort((a, b) => wear.numberOf(a.id) - wear.numberOf(b.id));

          return (
            <OutfitCard
              outfit={o}
              items={items}
              numberOf={wear.numberOf}
              showsDate
              onFavorite={() => unfavorite(o)}
              onEdit={() => navigation.navigate('OutfitBuilder', { editingOutfit: o })}
              onItem={id => navigation.navigate('ItemDetails', { id })}
            />
          );
        }}
        ListEmptyComponent={
          <View style={elements.emptyState}>
            <Ionicons name="heart-outline" size={ICON_SIZE.emptyState} color={C.subtle} />
            <Text style={elements.emptyTitle}>No favorites yet</Text>
            <Text style={elements.emptyText}>Tap the heart on any logged outfit in the Calendar to save it here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
});
