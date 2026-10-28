import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PieChart from 'react-native-pie-chart';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { useWearIndex } from '../hooks/useWearIndex';
import { formatPrice, formatPriceWhole, formatPriceCompact, plural } from '../utils/format';
import { C, T, CAT_COLORS, BRAND_COLORS } from '../theme';
import { elements } from '../elementStyles';

type Mode = 'Qty' | 'Value';
type Datum = { name: string; value: number; color: string };

const ModeToggle = ({ mode, setMode, label }: { mode: Mode; setMode: (m: Mode) => void; label: string }) => (
  <View style={elements.segmented}>
    {(['Qty', 'Value'] as Mode[]).map(m => (
      <TouchableOpacity
        key={m}
        onPress={() => setMode(m)}
        style={[elements.segmentedOption, mode === m && elements.segmentedOptionSelected]}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === m }}
        accessibilityLabel={`${label} by ${m === 'Qty' ? 'quantity' : 'value'}`}
      >
        <Text style={[elements.segmentedText, mode === m && elements.segmentedTextSelected]}>{m}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const Legend = ({ data, mode }: { data: Datum[]; mode: Mode }) => {
  const total = data.reduce((a, x) => a + x.value, 0);
  return (
    <View style={s.legend}>
      {data.map(d => {
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
        const amount = mode === 'Value' ? formatPriceWhole(d.value) : String(d.value);
        return (
          <View key={d.name} style={s.legendRow} accessible accessibilityLabel={`${d.name}, ${amount}, ${pct} percent`}>
            <View style={[s.legendDot, { backgroundColor: d.color }]} />
            <Text style={s.legendText}>{d.name} ({amount}, {pct}%)</Text>
          </View>
        );
      })}
    </View>
  );
};

const Donut = ({ data, center, caption }: { data: Datum[]; center: string; caption: string }) => (
  <View style={s.donutWrap}>
    <PieChart
      widthAndHeight={200}
      series={data.map(d => ({
        value: d.value,
        color: d.color,
        label: { text: String(d.value), fontSize: 12, fontWeight: 'bold', fill: C.main },
      }))}
      cover={{ radius: 0.7, color: C.surface }}
      padAngle={0.01}
    />
    <View style={[s.donutCenter, { pointerEvents: 'none' }]}>
      <Text style={s.donutCenterNum}>{center}</Text>
      <Text style={s.donutCenterLabel}>{caption}</Text>
    </View>
  </View>
);

type InsightProps = {
  rank: string;
  name: string;
  detail: string;
  value: string;
  subValue: string;
  accent: boolean;
  onPress: () => void;
};

const InsightRow = ({ rank, name, detail, value, subValue, accent, onPress }: InsightProps) => (
  <TouchableOpacity
    style={s.insightRow}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${name}, ${detail}, ${value}, ${subValue}. Open item details.`}
  >
    <View style={[s.insightRank, !accent && { backgroundColor: C.subtle }]}>
      <Text style={[s.insightRankText, !accent && { color: C.primary }]}>{rank}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.insightName} numberOfLines={1}>{name}</Text>
      <Text style={s.insightDetail} numberOfLines={1}>{detail}</Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={s.insightValue}>{value}</Text>
      <Text style={s.insightSubValue}>{subValue}</Text>
    </View>
  </TouchableOpacity>
);

export default function StatsScreen() {
  const { clothingItems, outfits } = useStore();
  const navigation = useNavigation() as any;
  const wear = useWearIndex();

  const [chartMode, setChartMode] = useState<Mode>('Qty');
  const [brandMode, setBrandMode] = useState<Mode>('Qty');

  /**
   * The charts describe the closet that you can wear today, so they leave out
   * the archived clothes. A footnote below the numbers gives the archived count.
   */
  const activeItems = useMemo(() => clothingItems.filter(i => !i.archived), [clothingItems]);
  const archivedCount = clothingItems.length - activeItems.length;

  const totalItems = activeItems.length;
  const totalSpend = activeItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
  const totalOutfits = outfits.length;

  const categoryData = useMemo<Datum[]>(() => {
    const counts: Record<string, number> = {};
    const values: Record<string, number> = {};

    activeItems.forEach(i => {
      counts[i.hierarchyCategory] = (counts[i.hierarchyCategory] || 0) + 1;
      values[i.hierarchyCategory] = (values[i.hierarchyCategory] || 0) + (Number(i.price) || 0);
    });

    const useValues = chartMode === 'Value';
    return Object.keys(counts)
      .map(k => ({
        name: k,
        value: useValues ? Math.round(values[k]) : counts[k],
        color: CAT_COLORS[k] || '#888',
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [activeItems, chartMode]);

  const brandData = useMemo<Datum[]>(() => {
    const counts: Record<string, number> = {};
    const values: Record<string, number> = {};

    activeItems.forEach(i => {
      const b = i.brand || 'Unknown';
      counts[b] = (counts[b] || 0) + 1;
      values[b] = (values[b] || 0) + (Number(i.price) || 0);
    });

    const useValues = brandMode === 'Value';
    return Object.keys(counts)
      .filter(k => (useValues ? values[k] > 0 : counts[k] > 0))
      .sort((a, b) => (useValues ? values[b] - values[a] : counts[b] - counts[a]))
      .slice(0, 6)
      .map((k, idx) => ({
        name: k,
        value: useValues ? Math.round(values[k]) : counts[k],
        color: BRAND_COLORS[idx] || '#888',
      }));
  }, [activeItems, brandMode]);

  const insights = useMemo(() => {
    const withStats = clothingItems.map(item => {
      const count = wear.wearCount(item.id);
      const price = Number(item.price) || 0;
      return { item, count, costPerWear: count > 0 ? price / count : price };
    });

    const mostWorn = withStats
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Archived pieces are already dealt with, so they do not belong here.
    const leastWorn = withStats
      .filter(x => !x.item.archived)
      .sort((a, b) => a.count - b.count || (Number(b.item.price) || 0) - (Number(a.item.price) || 0))
      .slice(0, 5);

    return { mostWorn, leastWorn };
  }, [clothingItems, wear]);

  const centerText = (data: Datum[], mode: Mode) => {
    if (data.length === 0) return '0';
    const total = data.reduce((a, d) => a + d.value, 0);
    return mode === 'Value' ? formatPriceCompact(total) : String(total);
  };

  const openItem = (id: string) => navigation.navigate('ItemDetails', { id });

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <View style={elements.screenHeader}>
        <Text style={elements.screenTitle} accessibilityRole="header">Statistics</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.summaryRow}>
          <View style={s.summaryCard} accessible accessibilityLabel={plural(totalItems)}>
            <Text style={s.summaryNum}>{totalItems}</Text>
            <Text style={s.summaryLabel}>Items</Text>
          </View>
          <View style={s.summaryCard} accessible accessibilityLabel={`${formatPriceWhole(totalSpend)} total spent`}>
            <Text style={s.summaryNum}>{formatPriceCompact(totalSpend)}</Text>
            <Text style={s.summaryLabel}>Total Spent</Text>
          </View>
          <View style={s.summaryCard} accessible accessibilityLabel={`${totalOutfits} outfits`}>
            <Text style={s.summaryNum}>{totalOutfits}</Text>
            <Text style={s.summaryLabel}>Outfits</Text>
          </View>
        </View>

        {archivedCount > 0 && (
          <Text style={s.footnote}>
            These numbers leave out {archivedCount} archived item{archivedCount === 1 ? '' : 's'}.
          </Text>
        )}

        <View style={s.chartCard}>
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>By Category</Text>
            <ModeToggle mode={chartMode} setMode={setChartMode} label="Category" />
          </View>
          {categoryData.length > 0 ? (
            <>
              <Donut
                data={categoryData}
                center={centerText(categoryData, chartMode)}
                caption={chartMode === 'Value' ? 'Total Value' : 'Total Items'}
              />
              <Legend data={categoryData} mode={chartMode} />
            </>
          ) : <Text style={s.emptyChart}>No items yet — import your wardrobe.</Text>}
        </View>

        <View style={s.chartCard}>
          <Text style={s.chartTitle}>Most Worn Items</Text>
          <View style={s.insightList}>
            {insights.mostWorn.map((x, idx) => (
              <InsightRow
                key={x.item.id}
                rank={String(idx + 1)}
                name={x.item.name || x.item.subCategory}
                detail={x.item.brand || 'No brand'}
                value={plural(x.count, 'wear')}
                subValue={`${formatPrice(x.costPerWear)}/wear`}
                accent
                onPress={() => openItem(x.item.id)}
              />
            ))}
            {insights.mostWorn.length === 0 && (
              <Text style={s.emptyHint}>Log some outfits to see insights.</Text>
            )}
          </View>
        </View>

        <View style={s.chartCard}>
          <Text style={s.chartTitle}>Declutter (Least Worn)</Text>
          <View style={s.insightList}>
            {insights.leastWorn.map(x => (
              <InsightRow
                key={x.item.id}
                rank={`#${wear.numberOf(x.item.id)}`}
                name={x.item.name || x.item.subCategory}
                detail={x.item.brand || 'No brand'}
                value={x.count === 0 ? 'Never worn' : plural(x.count, 'wear')}
                subValue={`${formatPriceWhole(x.item.price)} total`}
                accent={false}
                onPress={() => openItem(x.item.id)}
              />
            ))}
            {insights.leastWorn.length === 0 && (
              <Text style={s.emptyHint}>Add items to see declutter candidates.</Text>
            )}
          </View>
        </View>

        <View style={s.chartCard}>
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>By Brand</Text>
            <ModeToggle mode={brandMode} setMode={setBrandMode} label="Brand" />
          </View>
          {brandData.length > 0 ? (
            <>
              <Donut
                data={brandData}
                center={centerText(brandData, brandMode)}
                caption={brandMode === 'Value' ? 'Total Value' : 'Top Brands'}
              />
              <Legend data={brandData} mode={brandMode} />
            </>
          ) : <Text style={s.emptyChart}>No brand data — add brands to your items.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.main },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  footnote: { color: C.secondary, fontSize: T.caption, marginTop: -8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.subtle, padding: 16, alignItems: 'center' },
  summaryNum: { color: C.accent, fontSize: T.title, fontWeight: '900' },
  summaryLabel: { color: C.secondary, fontSize: T.micro, marginTop: 4 },
  chartCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.subtle, padding: 16, marginBottom: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  chartTitle: { color: C.primary, fontWeight: '700', fontSize: T.headline },
  donutWrap: { alignItems: 'center', position: 'relative', marginVertical: 10 },
  donutCenter: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  donutCenterNum: { color: C.primary, fontSize: T.title, fontWeight: '900' },
  donutCenterLabel: { color: C.secondary, fontSize: T.micro, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  legend: { marginTop: 24, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { color: C.secondary, fontSize: T.footnote, fontWeight: '500' },
  emptyChart: { color: C.secondary, textAlign: 'center', paddingVertical: 40, fontSize: T.footnote },
  insightList: { marginTop: 12, gap: 4 },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  insightRank: { minWidth: 28, height: 28, paddingHorizontal: 4, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  insightRankText: { color: C.main, fontSize: T.micro, fontWeight: '900' },
  insightName: { color: C.primary, fontSize: T.body, fontWeight: '600' },
  insightDetail: { color: C.secondary, fontSize: T.micro },
  insightValue: { color: C.primary, fontSize: T.footnote, fontWeight: '700' },
  insightSubValue: { color: C.accent, fontSize: T.micro, fontWeight: '600' },
  emptyHint: { color: C.secondary, fontSize: T.caption, fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },
});
