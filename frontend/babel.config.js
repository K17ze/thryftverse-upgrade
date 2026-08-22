module.exports = function(api) {
  api.cache(true);
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets/plugin',
      // React Compiler (stable, React 19.2+) — auto-memoises components and
      // hooks, eliminating manual useMemo/useCallback/React.memo boilerplate.
      // Enabled in production for maximum optimisation. In development the
      // compiler also runs but with additional validation logging.
      [
        'babel-plugin-react-compiler',
        {
          // compilationMode: 'infer' lets the compiler decide which functions
          // to optimise based on their usage patterns.
          compilationMode: 'infer',
          // sources: (filename) => filename.includes('src'),
        },
      ],
      // Strip console.log/warn/error in production builds to reduce bundle
      // size and prevent sensitive data leaking via logcat / Console.app.
      // console.error is preserved for React Native's error reporting.
      ...(isProduction
        ? [['transform-remove-console', { exclude: ['error'] }]]
        : []),
    ],
  };
};
