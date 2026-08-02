import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/src/theme';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}
