import React from 'react';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from './src/screens/HomeScreen';
import ClosetScreen from './src/screens/ClosetScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ItemDetailsScreen from './src/screens/ItemDetailsScreen';
import OutfitHistoryScreen from './src/screens/OutfitHistoryScreen';
import OutfitBuilderScreen from './src/screens/OutfitBuilderScreen';
import SuggestionsScreen from './src/screens/SuggestionsScreen';
import ArchivedScreen from './src/screens/ArchivedScreen';
import FavoriteOutfitsScreen from './src/screens/FavoriteOutfitsScreen';
import VacationScreen from './src/screens/VacationScreen';
import ToastHost from './src/components/ToastHost';
import ShareSheet from './src/components/ShareSheet';
import PhotoRepairGate from './src/components/PhotoRepairGate';
import { C } from './src/theme';

LogBox.ignoreLogs(['DateTimePicker: `onChange` is deprecated']);

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const ClosetStack = createNativeStackNavigator();
const CalendarStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const StatsStack = createNativeStackNavigator();

const OOTD_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.main, card: C.surface, border: C.subtle, primary: C.accent, text: C.primary },
};

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Suggestions" component={SuggestionsScreen} />
      {/* A suggestion links to the items in it, so this stack needs the screen. */}
      <HomeStack.Screen name="ItemDetails" component={ItemDetailsScreen} />
      {/* "Build Outfit With This" on an item screen opens this from here too. */}
      <HomeStack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} />
    </HomeStack.Navigator>
  );
}

function ClosetNavigator() {
  return (
    <ClosetStack.Navigator screenOptions={{ headerShown: false }}>
      <ClosetStack.Screen name="ClosetMain" component={ClosetScreen} />
      <ClosetStack.Screen name="ItemDetails" component={ItemDetailsScreen} />
      <ClosetStack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} />
      <ClosetStack.Screen name="Archived" component={ArchivedScreen} />
      <ClosetStack.Screen name="Vacation" component={VacationScreen} />
    </ClosetStack.Navigator>
  );
}

function CalendarNavigator() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen name="CalendarMain" component={CalendarScreen} />
      <CalendarStack.Screen name="OutfitHistory" component={OutfitHistoryScreen} />
      <CalendarStack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} />
      <CalendarStack.Screen name="Favorites" component={FavoriteOutfitsScreen} />
      <CalendarStack.Screen name="ItemDetails" component={ItemDetailsScreen} />
    </CalendarStack.Navigator>
  );
}

function StatsNavigator() {
  return (
    <StatsStack.Navigator screenOptions={{ headerShown: false }}>
      <StatsStack.Screen name="StatsMain" component={StatsScreen} />
      <StatsStack.Screen name="ItemDetails" component={ItemDetailsScreen} />
    </StatsStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
}

export default function App() {
  return (
    // GestureHandlerRootView must wrap everything, or a gesture inside a screen
    // never receives a touch. The pinch-zoom photo viewer depends on it.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Photos have to be back in place before any screen draws one. */}
        <PhotoRepairGate>
        <NavigationContainer theme={OOTD_THEME}>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.subtle },
              tabBarActiveTintColor: C.accent,
              tabBarInactiveTintColor: C.secondary,
              tabBarIcon: ({ focused, color, size }) => {
                const icons = {
                  Home: focused ? 'home' : 'home-outline',
                  Closet: focused ? 'shirt' : 'shirt-outline',
                  Calendar: focused ? 'calendar' : 'calendar-outline',
                  Stats: focused ? 'stats-chart' : 'stats-chart-outline',
                  Settings: focused ? 'settings' : 'settings-outline',
                };
                return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
              },
            })}
          >
            <Tab.Screen name="Home" component={HomeNavigator} />
            <Tab.Screen name="Closet" component={ClosetNavigator} />
            <Tab.Screen name="Calendar" component={CalendarNavigator} />
            <Tab.Screen name="Stats" component={StatsNavigator} />
            <Tab.Screen name="Settings" component={SettingsNavigator} />
          </Tab.Navigator>
        </NavigationContainer>
        </PhotoRepairGate>
        {/* Mounted here, not inside a screen, so closing the sheet or changing
            tabs never cancels an upload that is still running. */}
        <ShareSheet />
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
