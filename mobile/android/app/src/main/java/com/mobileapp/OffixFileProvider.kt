package com.mesnation

import androidx.core.content.FileProvider

/**
 * Свой класс, а не androidx FileProvider напрямую: у библиотек (выбор фото и др.)
 * свои провайдеры, и два одинаковых имени класса в манифесте конфликтуют.
 */
class OffixFileProvider : FileProvider()
