module.exports = function(api) {
  api.cache(true);
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets/plugin',
      // Strip console.log/warn/error in production builds to reduce bundle
      // size and prevent sensitive data leaking via logcat / Console.app.
      // console.error is preserved for React Native's error reporting.
      ...(isProduction
        ? [['transform-remove-console', { exclude: ['error'] }]]
        : []),
    ],
  };
};
