import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Service for persisting user settings
class SettingsService {
  static const String _keyTheme = 'theme';
  static const String _keyFontSize = 'fontSize';
  static const String _keyHrPageBreak = 'hrPageBreak';
  static const String _keyEmojiStyle = 'emojiStyle';
  static const String _keyLocale = 'locale';
  static const String _keySupportMermaid = 'supportMermaid';
  static const String _keySupportVega = 'supportVega';
  static const String _keySupportVegaLite = 'supportVegaLite';
  static const String _keySupportDot = 'supportDot';
  static const String _keySupportInfographic = 'supportInfographic';
  static const String _keyScrollPositions = 'scrollPositions';
  static const int _maxScrollPositions = 100; // Limit stored positions

  SharedPreferences? _prefs;

  /// Initialize the settings service
  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // Theme
  String get theme => _prefs?.getString(_keyTheme) ?? 'default';
  set theme(String value) => _prefs?.setString(_keyTheme, value);

  // Font size
  int get fontSize => _prefs?.getInt(_keyFontSize) ?? 16;
  set fontSize(int value) => _prefs?.setInt(_keyFontSize, value);

  // HR as page break in DOCX export
  bool get hrPageBreak => _prefs?.getBool(_keyHrPageBreak) ?? true;
  set hrPageBreak(bool value) => _prefs?.setBool(_keyHrPageBreak, value);

  // Emoji style in DOCX export: 'apple', 'windows', or 'system'
  String get emojiStyle => _prefs?.getString(_keyEmojiStyle) ?? 'system';
  set emojiStyle(String value) => _prefs?.setString(_keyEmojiStyle, value);

  // Locale
  String get locale => _prefs?.getString(_keyLocale) ?? 'system';
  set locale(String value) => _prefs?.setString(_keyLocale, value);

  // Supported file extensions
  bool get supportMermaid => _prefs?.getBool(_keySupportMermaid) ?? true;
  set supportMermaid(bool value) => _prefs?.setBool(_keySupportMermaid, value);

  bool get supportVega => _prefs?.getBool(_keySupportVega) ?? true;
  set supportVega(bool value) => _prefs?.setBool(_keySupportVega, value);

  bool get supportVegaLite => _prefs?.getBool(_keySupportVegaLite) ?? true;
  set supportVegaLite(bool value) => _prefs?.setBool(_keySupportVegaLite, value);

  bool get supportDot => _prefs?.getBool(_keySupportDot) ?? true;
  set supportDot(bool value) => _prefs?.setBool(_keySupportDot, value);

  bool get supportInfographic => _prefs?.getBool(_keySupportInfographic) ?? true;
  set supportInfographic(bool value) => _prefs?.setBool(_keySupportInfographic, value);

  /// Get list of allowed file extensions based on settings
  List<String> get allowedExtensions {
    final extensions = ['md', 'markdown'];
    if (supportMermaid) extensions.add('mermaid');
    if (supportVega) extensions.add('vega');
    if (supportVegaLite) {
      extensions.add('vl');
      extensions.add('vega-lite');
    }
    if (supportDot) extensions.add('gv');
    if (supportInfographic) extensions.add('infographic');
    return extensions;
  }

  /// Get all settings as a map
  Map<String, dynamic> toMap() {
    return {
      'theme': theme,
      'fontSize': fontSize,
      'hrPageBreak': hrPageBreak,
      'emojiStyle': emojiStyle,
      'locale': locale,
      'supportMermaid': supportMermaid,
      'supportVega': supportVega,
      'supportVegaLite': supportVegaLite,
      'supportDot': supportDot,
      'supportInfographic': supportInfographic,
    };
  }

  // Scroll position memory (file path -> line number, using double for precision)
  Map<String, double> _scrollPositionsCache = {};
  bool _scrollPositionsLoaded = false;

  /// Load scroll positions from storage
  void _loadScrollPositions() {
    if (_scrollPositionsLoaded) return;
    _scrollPositionsLoaded = true;
    
    final json = _prefs?.getString(_keyScrollPositions);
    if (json != null) {
      try {
        final decoded = jsonDecode(json) as Map<String, dynamic>;
        _scrollPositionsCache = decoded.map((k, v) => MapEntry(k, (v as num).toDouble()));
      } catch (e) {
        _scrollPositionsCache = {};
      }
    }
  }

  /// Save scroll positions to storage
  void _saveScrollPositions() {
    // Limit the number of stored positions
    if (_scrollPositionsCache.length > _maxScrollPositions) {
      final entries = _scrollPositionsCache.entries.toList();
      _scrollPositionsCache = Map.fromEntries(
        entries.sublist(entries.length - _maxScrollPositions),
      );
    }
    _prefs?.setString(_keyScrollPositions, jsonEncode(_scrollPositionsCache));
  }

  /// Get scroll position for a file
  double getScrollPosition(String filePath) {
    _loadScrollPositions();
    return _scrollPositionsCache[filePath] ?? 0;
  }

  /// Save scroll position for a file
  void setScrollPosition(String filePath, double line) {
    _loadScrollPositions();
    if (line > 0) {
      _scrollPositionsCache[filePath] = line;
      _saveScrollPositions();
    } else if (_scrollPositionsCache.containsKey(filePath)) {
      // Remove if scrolled to top
      _scrollPositionsCache.remove(filePath);
      _saveScrollPositions();
    }
  }
}

/// Global settings service instance
final settingsService = SettingsService();
