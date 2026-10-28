const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Fix for import.meta errors by disabling package exports resolution
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
