import { View, ActivityIndicator, Text } from 'react-native';
import { colors } from '@/src/theme';
import { useAuth } from '@/src/auth';

export default function Index() {
  const { loading, user, debugInfo } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, padding: 24 }}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={{ color: '#888', marginTop: 20, fontSize: 12, textAlign: 'center' }}>
        loading: {String(loading)}{'\n'}user: {user ? 'yes' : 'no'}{'\n'}{debugInfo}
      </Text>
    </View>
  );
}