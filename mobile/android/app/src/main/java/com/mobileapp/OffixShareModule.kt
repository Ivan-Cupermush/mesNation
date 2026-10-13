package com.mesnation

import android.app.Activity
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.app.Person
import androidx.core.content.FileProvider
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/**
 * «Поделиться» в обе стороны, как в Telegram и WhatsApp:
 *  - shareFiles — файлы из Offix в системное окно «Поделиться» (WhatsApp, почта, галерея…);
 *  - приём: Offix есть в системном «Поделиться» других приложений; файлы копируются
 *    к нам в кеш, а JS показывает экран «Отправить в…»;
 *  - setShareTargets — недавние чаты прямо в системном окне «Поделиться»
 *    и в меню долгого нажатия на значок приложения.
 */
class OffixShareModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx), ActivityEventListener {

  companion object {
    const val NAME = "OffixShare"
    const val EVENT = "OffixShareIntent"
    private const val CATEGORY = "com.mesnation.category.SHARE_TARGET"
    /** Один файл больше этого не копируем — сервер его всё равно не примет. */
    private const val MAX_FILE_BYTES = 2L * 1024 * 1024 * 1024
  }

  private val io = Executors.newSingleThreadExecutor()
  @Volatile private var pending: WritableMap? = null
  @Volatile private var initialChecked = false

  init {
    ctx.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {}

  override fun onNewIntent(intent: Intent) {
    if (!isShare(intent)) return
    consume(intent)
    io.execute {
      pending = readShare(intent)
      emit()
    }
  }

  private fun emit() {
    if (ctx.hasActiveReactInstance()) ctx.emitDeviceEvent(EVENT)
  }

  private fun isShare(intent: Intent?): Boolean =
    intent != null && (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE)

  /** Чтобы при пересоздании экрана (поворот, тема) то же «Поделиться» не открылось второй раз. */
  private fun consume(intent: Intent) {
    ctx.currentActivity?.let { a ->
      if (a.intent === intent || isShare(a.intent)) a.intent = Intent(Intent.ACTION_MAIN)
    }
  }

  /** То, чем поделились (холодный старт или пришло, пока JS не был готов). Отдаётся один раз. */
  @ReactMethod
  fun getPendingShare(promise: Promise) {
    if (!initialChecked) {
      initialChecked = true
      val intent = ctx.currentActivity?.intent
      if (isShare(intent)) {
        consume(intent!!)
        io.execute {
          try {
            promise.resolve(readShare(intent))
          } catch (e: Exception) {
            promise.reject("E_SHARE", e.message, e)
          }
        }
        return
      }
    }
    // Копирование могло ещё идти — встанем в ту же очередь.
    io.execute {
      val p = pending
      pending = null
      promise.resolve(p)
    }
  }

  private fun readShare(intent: Intent): WritableMap {
    val out = Arguments.createMap()
    out.putString("id", UUID.randomUUID().toString())
    intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.let { out.putString("text", it) }
    intent.getStringExtra(Intent.EXTRA_SUBJECT)?.let { out.putString("subject", it) }
    // Выбрали чат прямо в системном «Поделиться» — откроем сразу его.
    intent.getStringExtra(ShortcutManagerCompat.EXTRA_SHORTCUT_ID)?.removePrefix("chat_")?.toIntOrNull()?.let {
      out.putInt("chatId", it)
    }

    val uris = LinkedHashSet<Uri>()
    if (intent.action == Intent.ACTION_SEND) {
      streamExtra(intent)?.let { uris.add(it) }
    } else {
      streamListExtra(intent)?.let { uris.addAll(it) }
    }
    intent.clipData?.let { clip ->
      for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
    }

    val files = Arguments.createArray()
    var skipped = 0
    val dir = File(ctx.cacheDir, "incoming/${System.currentTimeMillis()}").apply { mkdirs() }
    for (uri in uris) {
      try {
        if (!isSafeSource(uri)) {
          skipped++
          continue
        }
        val (name, size) = queryMeta(uri)
        if (size != null && size > MAX_FILE_BYTES) {
          skipped++
          continue
        }
        val target = uniqueFile(dir, sanitize(name ?: uri.lastPathSegment ?: "file"))
        val input = ctx.contentResolver.openInputStream(uri)
        if (input == null) {
          skipped++
          continue
        }
        input.use { src -> target.outputStream().use { dst -> src.copyTo(dst, 64 * 1024) } }
        val mime = ctx.contentResolver.getType(uri) ?: guessMime(target.name, intent.type)
        val f = Arguments.createMap()
        f.putString("path", target.absolutePath)
        f.putString("name", target.name)
        f.putString("mime", mime)
        f.putDouble("size", target.length().toDouble())
        files.pushMap(f)
      } catch (e: Exception) {
        skipped++
      }
    }
    out.putArray("files", files)
    out.putInt("skipped", skipped)
    return out
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri>? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)

  /**
   * Чужое приложение не должно подсунуть «поделиться» нашими же закрытыми файлами
   * (токен входа, кеш чатов), чтобы пользователь сам отправил их в чат.
   */
  private fun isSafeSource(uri: Uri): Boolean {
    val pkg = ctx.packageName
    return when (uri.scheme) {
      "content" -> uri.authority?.startsWith(pkg) != true
      "file" -> {
        val path = File(uri.path ?: return false).canonicalPath
        val dataDir = File(ctx.applicationInfo.dataDir).canonicalPath
        !path.startsWith(dataDir) && !path.contains("/$pkg/")
      }
      else -> false
    }
  }

  private fun queryMeta(uri: Uri): Pair<String?, Long?> {
    if (uri.scheme == "file") {
      val f = File(uri.path ?: "")
      return f.name to f.length()
    }
    var name: String? = null
    var size: Long? = null
    ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val si = c.getColumnIndex(OpenableColumns.SIZE)
        if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni)
        if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
      }
    }
    return name to size
  }

  private fun sanitize(name: String): String {
    val clean = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").trim().trimStart('.')
    return clean.ifEmpty { "file" }.take(120)
  }

  private fun uniqueFile(dir: File, name: String): File {
    var f = File(dir, name)
    var i = 1
    val dot = name.lastIndexOf('.')
    val base = if (dot > 0) name.substring(0, dot) else name
    val ext = if (dot > 0) name.substring(dot) else ""
    while (f.exists()) f = File(dir, "$base (${i++})$ext")
    return f
  }

  private fun guessMime(name: String, fallback: String?): String {
    val ext = name.substringAfterLast('.', "").lowercase()
    val byExt = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
    return byExt ?: fallback?.takeIf { !it.contains('*') } ?: "application/octet-stream"
  }

  // ---------- Из Offix в другие приложения ----------

  @ReactMethod
  fun shareFiles(files: ReadableArray, text: String?, title: String?, promise: Promise) {
    val activity = ctx.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Приложение не на экране")
      return
    }
    try {
      val authority = "${ctx.packageName}.offix.files"
      val uris = ArrayList<Uri>()
      val mimes = ArrayList<String>()
      for (i in 0 until files.size()) {
        val item = files.getMap(i) ?: continue
        val path = item.getString("path") ?: continue
        val file = File(path.removePrefix("file://"))
        if (!file.exists()) continue
        uris.add(FileProvider.getUriForFile(ctx, authority, file))
        mimes.add(item.getString("mime") ?: guessMime(file.name, null))
      }
      val intent = Intent(if (uris.size > 1) Intent.ACTION_SEND_MULTIPLE else Intent.ACTION_SEND)
      when {
        uris.size > 1 -> intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        uris.size == 1 -> intent.putExtra(Intent.EXTRA_STREAM, uris[0])
      }
      intent.type = when {
        uris.isEmpty() -> "text/plain"
        mimes.distinct().size == 1 -> mimes[0]
        mimes.all { it.startsWith("image/") } -> "image/*"
        mimes.all { it.startsWith("video/") } -> "video/*"
        mimes.all { it.startsWith("image/") || it.startsWith("video/") } -> "*/*"
        else -> "*/*"
      }
      if (!text.isNullOrBlank()) intent.putExtra(Intent.EXTRA_TEXT, text)
      if (uris.isNotEmpty()) {
        val clip = ClipData.newRawUri(null, uris[0])
        for (u in uris.drop(1)) clip.addItem(ClipData.Item(u))
        intent.clipData = clip
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(intent, title ?: "Поделиться")
      // Внутри Offix для этого есть «Переслать» — себя в системном окне не показываем.
      chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(ComponentName(ctx, MainActivity::class.java)))
      chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_SHARE", e.message, e)
    }
  }

  // ---------- Недавние чаты в системном «Поделиться» ----------

  @ReactMethod
  fun setShareTargets(targets: ReadableArray, promise: Promise) {
    io.execute {
      try {
        val max = ShortcutManagerCompat.getMaxShortcutCountPerActivity(ctx).coerceAtMost(8).coerceAtLeast(1)
        val list = ArrayList<ShortcutInfoCompat>()
        for (i in 0 until minOf(targets.size(), max)) {
          val t = targets.getMap(i) ?: continue
          val chatId = t.getInt("id")
          val name = (t.getString("name") ?: "Чат").ifBlank { "Чат" }
          val id = "chat_$chatId"
          val open = Intent(Intent.ACTION_VIEW, Uri.parse("offix://chat/$chatId"), ctx, MainActivity::class.java)
          val icon = IconCompat.createWithAdaptiveBitmap(
            iconBitmap(t.getString("avatarPath"), t.getString("color") ?: "#1F7A52", t.getString("initials") ?: name.take(1)),
          )
          val b = ShortcutInfoCompat.Builder(ctx, id)
            .setShortLabel(name.take(24))
            .setLongLabel(name)
            .setIcon(icon)
            .setIntent(open)
            .setLongLived(true)
            .setRank(i)
            .setCategories(setOf(CATEGORY))
          if (t.hasKey("isGroup") && !t.getBoolean("isGroup")) {
            b.setPerson(Person.Builder().setName(name).setKey(id).setIcon(icon).build())
          }
          list.add(b.build())
        }
        ShortcutManagerCompat.setDynamicShortcuts(ctx, list)
        promise.resolve(list.size)
      } catch (e: Exception) {
        // Лимит частоты обновлений у системы — не ошибка для пользователя.
        promise.resolve(0)
      }
    }
  }

  @ReactMethod
  fun clearShareTargets(promise: Promise) {
    try {
      ShortcutManagerCompat.removeAllDynamicShortcuts(ctx)
    } catch (_: Exception) {
    }
    promise.resolve(true)
  }

  /** Значок чата: фото, обрезанное системой по форме значков, или инициалы на цвете. */
  private fun iconBitmap(avatarPath: String?, color: String, initials: String): Bitmap {
    val size = 216
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val photo = avatarPath?.let { p -> File(p.removePrefix("file://")).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.absolutePath) } }
    if (photo != null) {
      val side = minOf(photo.width, photo.height)
      val src = Rect((photo.width - side) / 2, (photo.height - side) / 2, (photo.width + side) / 2, (photo.height + side) / 2)
      canvas.drawBitmap(photo, src, RectF(0f, 0f, size.toFloat(), size.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
      return bmp
    }
    canvas.drawColor(runCatching { Color.parseColor(color) }.getOrDefault(Color.parseColor("#1F7A52")))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = Color.WHITE
      textAlign = Paint.Align.CENTER
      textSize = size * 0.3f
      isFakeBoldText = true
    }
    val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(initials.take(2).uppercase(), size / 2f, y, paint)
    return bmp
  }

  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {}
}
