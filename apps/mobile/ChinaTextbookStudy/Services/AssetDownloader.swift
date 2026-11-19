import Foundation
import CryptoKit
import ZIPFoundation

// MARK: - Manifest models

/// One entry per book in `ios-manifest.json`.
struct ManifestEntry: Codable, Hashable, Identifiable {
    let bookId: String
    let audioRefCount: Int
    let data: ManifestBundle
    let audio: ManifestBundle

    var id: String { bookId }
}

/// Top-level shape produced by `scripts/package-release-ios.sh`.
struct IosManifest: Codable, Hashable {
    let generatedAt: String
    let aacBitrate: String
    let books: [ManifestEntry]
}

// MARK: - Errors

enum AssetDownloadError: Error, LocalizedError {
    case manifestUnavailable
    case sha256Mismatch(expected: String, actual: String, file: String)
    case unzipFailed(String)
    case httpStatus(Int)

    var errorDescription: String? {
        switch self {
        case .manifestUnavailable:
            return "无法获取资源 manifest，请检查网络后重试"
        case .sha256Mismatch(let exp, let act, let file):
            return "校验失败 \(file)：期望 \(exp.prefix(12))…，实际 \(act.prefix(12))…"
        case .unzipFailed(let msg):
            return "解压失败：\(msg)"
        case .httpStatus(let code):
            return "下载失败 HTTP \(code)"
        }
    }
}

// MARK: - Downloader

/// Downloads + verifies + unzips the per-book release bundles produced by
/// `scripts/package-release-ios.sh`. State machine is observable so SwiftUI
/// can drive a progress UI without polling.
@MainActor
final class AssetDownloader: ObservableObject {
    static let shared = AssetDownloader()

    /// GitHub Release base URL. Update this when cutting a new iOS asset tag.
    /// The script outputs files like `audio-ios-<bookId>.zip` + `data-<bookId>.zip` + `ios-manifest.json`.
    var releaseBaseURL = URL(string: "https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.3-ios-resources")!

    @Published private(set) var manifest: IosManifest?
    @Published private(set) var bookProgress: [String: Double] = [:]   // bookId → 0...1
    @Published private(set) var inFlight: Set<String> = []
    @Published private(set) var lastError: String?

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 60
        cfg.timeoutIntervalForResource = 60 * 30
        return URLSession(configuration: cfg)
    }()

    /// Local destination roots — mirror what DataLoader expects.
    private var dataRoot: URL { DataLoader.shared.sandboxDataRoot }
    private var audioRoot: URL { DataLoader.shared.sandboxAudioRoot }

    /// bookId → 音频包是否齐。`isBookDownloaded` 会被书单每帧调用,探测要解 JSON,
    /// 不缓存会很贵。任何一次下载完成都整表清空 —— 音频分片是内容寻址、跨书共享的,
    /// 下了 A 也可能补齐 B 缺的那几条。
    private var audioReadyCache: [String: Bool] = [:]

    // MARK: - Manifest

    /// Fetch the manifest from the GitHub Release. Caches it on disk so the
    /// app can render an offline list of books-already-downloaded later.
    @discardableResult
    func loadManifest() async throws -> IosManifest {
        let url = releaseBaseURL.appendingPathComponent("ios-manifest.json")
        let (data, resp) = try await session.data(from: url)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw AssetDownloadError.httpStatus((resp as? HTTPURLResponse)?.statusCode ?? -1)
        }
        let manifest = try JSONDecoder().decode(IosManifest.self, from: data)
        try? FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)
        try? data.write(to: cacheRoot.appendingPathComponent("ios-manifest.json"))
        self.manifest = manifest
        audioReadyCache.removeAll()
        return manifest
    }

    /// Try to read a previously-cached manifest (offline launches).
    func loadCachedManifest() -> IosManifest? {
        let url = cacheRoot.appendingPathComponent("ios-manifest.json")
        guard let data = try? Data(contentsOf: url),
              let m = try? JSONDecoder().decode(IosManifest.self, from: data) else {
            return nil
        }
        // Bind legacy audio-only receipts to the manifest under which they were
        // installed, before a newer network manifest replaces that evidence.
        for entry in m.books where hasBookData(entry.bookId) {
            let marker = audioMarkerURL(entry.bookId)
            if let old = try? String(contentsOf: marker, encoding: .utf8),
               old.trimmingCharacters(in: .whitespacesAndNewlines) == entry.audio.sha256 {
                try? Self.bundleFingerprint(entry).write(to: marker, atomically: true, encoding: .utf8)
            }
        }
        self.manifest = m
        audioReadyCache.removeAll()
        return m
    }

    // MARK: - Per-book download

    /// 这本书是不是**真的**下好了 —— 数据包 + 音频包都得在。
    ///
    /// 以前只看 `outline.json`,于是「数据包下好了、音频包失败/被清掉」的书照样
    /// 显示「已下载」:课文页点「朗读全文」毫无反应,听读完成门槛永远解不开,
    /// 用户也找不到重新下载的入口(iosretention-6)。
    ///
    /// 内置体验包升级只补缺失文件，保留下载标记。资源包更新由数据/音频指纹
    /// 判断；标记缺失或不匹配时回到「需下载」，避免出现已下载却无声音的状态。
    func isBookDownloaded(_ bookId: String) -> Bool {
        hasBookData(bookId) && hasBookAudio(bookId)
    }

    /// 数据包(课程/课文/故事 JSON)是否已解压到本地。
    func hasBookData(_ bookId: String) -> Bool {
        let outline = dataRoot
            .appendingPathComponent("books", isDirectory: true)
            .appendingPathComponent(bookId, isDirectory: true)
            .appendingPathComponent("outline.json")
        return FileManager.default.fileExists(atPath: outline.path)
    }

    /// 音频包是否已落地。优先看下载器写的标记;没有标记(内置 seed 书、老版本
    /// 装好的书)时回落到抽样探测,免得把本来能用的书误判成「需下载」。
    func hasBookAudio(_ bookId: String) -> Bool {
        if let cached = audioReadyCache[bookId] { return cached }
        let ok: Bool
        if let entry = manifest?.books.first(where: { $0.bookId == bookId }) {
            let marker = try? String(contentsOf: audioMarkerURL(bookId), encoding: .utf8)
            ok = marker?.trimmingCharacters(in: .whitespacesAndNewlines) == Self.bundleFingerprint(entry)
        } else {
            ok = FileManager.default.fileExists(atPath: audioMarkerURL(bookId).path) || probeBookAudio(bookId)
        }
        audioReadyCache[bookId] = ok
        return ok
    }

    private var audioMarkerDir: URL {
        audioRoot.appendingPathComponent(".downloaded", isDirectory: true)
    }

    private func audioMarkerURL(_ bookId: String) -> URL {
        audioMarkerDir.appendingPathComponent(bookId)
    }

    nonisolated static func bundleFingerprint(_ entry: ManifestEntry) -> String {
        "\(entry.data.sha256)\n\(entry.audio.sha256)"
    }

    private func writeAudioMarker(_ entry: ManifestEntry) {
        try? FileManager.default.createDirectory(at: audioMarkerDir, withIntermediateDirectories: true)
        try? Self.bundleFingerprint(entry).write(to: audioMarkerURL(entry.bookId), atomically: true, encoding: .utf8)
    }

    /// 抽样探测:从这本书的数据里取前几条音频引用,看文件在不在。
    ///
    /// - 一条音频引用都没有(纯数学书之类)→ 视为不需要音频,返回 true;
    /// - 抽到的引用全部命中 → true;任何一条缺失 → false(重下是幂等的,
    ///   宁可多提示一次,也不要让用户对着没声音的课文干瞪眼)。
    private func probeBookAudio(_ bookId: String) -> Bool {
        let refs = sampleAudioRefs(bookId, limit: 8)
        guard !refs.isEmpty else { return true }
        return refs.allSatisfy { AudioPlayer.shared.resolve($0) != nil }
    }

    private func sampleAudioRefs(_ bookId: String, limit: Int) -> [String] {
        var refs: [String] = []
        func collect(_ path: String?) {
            guard refs.count < limit, let path, !path.isEmpty else { return }
            refs.append(path)
        }

        // 课文 / 故事的逐句音频最便宜，先探这两个。
        if let passages = (try? DataLoader.shared.loadPassages(bookId: bookId))?.passages {
            outer: for p in passages {
                for s in p.sentences {
                    collect(s.audio)
                    if refs.count >= limit { break outer }
                }
            }
        }
        if refs.count < limit, let stories = (try? DataLoader.shared.loadStories(bookId: bookId))?.stories {
            outer: for s in stories {
                for sentence in s.sentences {
                    collect(sentence.audio)
                    if refs.count >= limit { break outer }
                }
            }
        }
        // 再退到任意一节课的题目音频（数学等没有课文的书走这条）。
        if refs.count < limit, let lesson = firstLesson(bookId) {
            for q in lesson.questions {
                collect(q.audio?.question)
                collect(q.audio?.explanation)
                if refs.count >= limit { break }
            }
        }
        return refs
    }

    private func firstLesson(_ bookId: String) -> Lesson? {
        let dir = dataRoot
            .appendingPathComponent("books", isDirectory: true)
            .appendingPathComponent(bookId, isDirectory: true)
            .appendingPathComponent("lessons", isDirectory: true)
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return nil }
        guard let first = names.filter({ $0.hasSuffix(".json") }).sorted().first else { return nil }
        let lessonId = String(first.dropLast(".json".count))
        return try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId)
    }

    /// Download both bundles for a book sequentially. Idempotent — if the
    /// data already exists and SHA matches, the download is skipped.
    ///
    /// 音频包**解压成功之后**才写 per-book 落地标记(iosretention-6):数据包成功、
    /// 音频包失败时这本书不会假装「已下载」,下载卡照样给重试入口。
    func ensureBookDownloaded(_ entry: ManifestEntry) async throws {
        if inFlight.contains(entry.bookId) { return }
        inFlight.insert(entry.bookId)
        defer { inFlight.remove(entry.bookId) }
        bookProgress[entry.bookId] = 0
        lastError = nil
        // 上一轮失败留下的「音频不全」判断作废，重新探。
        audioReadyCache.removeAll()

        do {
            try await downloadBundle(
                bundle: entry.data,
                extractTo: dataRoot,
                weight: 0.2,
                bookId: entry.bookId
            )
            try await downloadBundle(
                bundle: entry.audio,
                extractTo: audioRoot.deletingLastPathComponent(),  // zip already contains an `audio/` prefix
                weight: 0.8,
                bookId: entry.bookId
            )
            writeAudioMarker(entry)
            audioReadyCache.removeAll()
            bookProgress[entry.bookId] = 1
            try? markExcludedFromBackup(dataRoot)
            try? markExcludedFromBackup(audioRoot)
        } catch {
            audioReadyCache.removeAll()
            lastError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
            throw error
        }
    }

    /// Stream-download a zip with progress, verify SHA-256, then unzip in place.
    private func downloadBundle(
        bundle: ManifestBundle,
        extractTo destination: URL,
        weight: Double,
        bookId: String
    ) async throws {
        let url = try bundle.downloadURL(relativeTo: releaseBaseURL)
        let (tempURL, resp) = try await session.download(from: url) { [weak self] received, expected in
            guard let self else { return }
            // expected may be -1 on chunked responses; fall back to manifest bytes
            let total = expected > 0 ? Double(expected) : Double(bundle.bytes)
            let frac = total > 0 ? Double(received) / total : 0
            Task { @MainActor in
                self.bookProgress[bookId] = (self.bookProgress[bookId] ?? 0) * (1 - weight) + frac * weight
            }
        }
        if let http = resp as? HTTPURLResponse, http.statusCode != 200 {
            throw AssetDownloadError.httpStatus(http.statusCode)
        }

        let actualSha = try sha256Hex(of: tempURL)
        guard actualSha == bundle.sha256 else {
            try? FileManager.default.removeItem(at: tempURL)
            throw AssetDownloadError.sha256Mismatch(expected: bundle.sha256, actual: actualSha, file: bundle.name)
        }

        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        do {
            try Self.installArchive(tempURL, destination: destination)
        } catch {
            throw AssetDownloadError.unzipFailed(String(describing: error))
        }
        try? FileManager.default.removeItem(at: tempURL)
    }

    /// Unzip to an empty staging directory, then atomically replace each resource
    /// file. Direct in-place unzip fails on existing files during a book update.
    /// Learner progress lives separately and is never part of these archives.
    nonisolated static func installArchive(_ archive: URL, destination: URL) throws {
        let fm = FileManager.default
        let staging = fm.temporaryDirectory.appendingPathComponent("cstf-install-\(UUID().uuidString)")
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: staging) }
        try fm.unzipItem(at: archive, to: staging)
        guard let entries = fm.enumerator(at: staging, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else {
            throw AssetDownloadError.unzipFailed("无法读取解压资源")
        }
        var files: [(URL, URL)] = []
        for case let source as URL in entries {
            let attributes = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard attributes.isSymbolicLink != true else { throw AssetDownloadError.unzipFailed("资源包含符号链接") }
            guard attributes.isRegularFile == true else { continue }
            let relative = String(source.path.dropFirst(staging.path.count + 1))
            files.append((source, destination.appendingPathComponent(relative)))
        }
        // Complete archive validation precedes any writes to installed resources.
        for (source, target) in files {
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try Data(contentsOf: source)
            if (try? Data(contentsOf: target)) != data { try data.write(to: target, options: .atomic) }
        }
    }

    // MARK: - Story illustrations (content-8)

    /// Resolve a story illustration to the locally extracted file, or nil
    /// when the file is missing (callers degrade to a placeholder block).
    ///
    /// The data zip built by `scripts/package-release-ios.sh` carries the
    /// book's illustrations at `story-images/<bookId>/<storyId>.jpg`, which
    /// unzips next to `books/` under `Application Support/cstf/data/`.
    /// `imagePath` is the web-style path from `Story.image`
    /// (e.g. "/story-images/<bookId>/<storyId>.jpg"); when absent we fall
    /// back to the conventional location.
    nonisolated static func storyImageURL(bookId: String, storyId: String, imagePath: String? = nil) -> URL? {
        let root = DataLoader.shared.sandboxDataRoot
        var candidates: [URL] = []
        if let imagePath, !imagePath.isEmpty {
            var rel = imagePath
            if rel.hasPrefix("/") { rel.removeFirst() }
            candidates.append(root.appendingPathComponent(rel))
        }
        candidates.append(
            root.appendingPathComponent("story-images", isDirectory: true)
                .appendingPathComponent(bookId, isDirectory: true)
                .appendingPathComponent("\(storyId).jpg")
        )
        return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
    }

    // MARK: - Helpers

    private var cacheRoot: URL {
        dataRoot.deletingLastPathComponent()  // .../cstf/
    }

    private func sha256Hex(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while autoreleasepool(invoking: {
            let chunk = handle.readData(ofLength: 1 << 20)
            if chunk.isEmpty { return false }
            hasher.update(data: chunk)
            return true
        }) {}
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func markExcludedFromBackup(_ url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var u = url
        try u.setResourceValues(values)
    }
}

// MARK: - URLSession async download with progress

private extension URLSession {
    /// `download(from:)` with a progress callback. Wraps the delegate-based
    /// API in async/await so the call site stays clean.
    func download(
        from url: URL,
        progress: @escaping (Int64, Int64) -> Void
    ) async throws -> (URL, URLResponse) {
        try await withCheckedThrowingContinuation { cont in
            let task = self.downloadTask(with: url) { tmp, resp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let tmp, let resp else {
                    cont.resume(throwing: URLError(.badServerResponse)); return
                }
                // Move out of the system tmp dir before iOS reclaims it
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent("cstf-\(UUID().uuidString).zip")
                do {
                    try FileManager.default.moveItem(at: tmp, to: dest)
                    cont.resume(returning: (dest, resp))
                } catch {
                    cont.resume(throwing: error)
                }
            }
            let observation = task.progress.observe(\.fractionCompleted) { p, _ in
                progress(Int64(p.completedUnitCount), Int64(p.totalUnitCount))
            }
            // Keep the observation alive for the lifetime of the task
            objc_setAssociatedObject(task, &progressObservationKey, observation, .OBJC_ASSOCIATION_RETAIN)
            task.resume()
        }
    }
}

private var progressObservationKey: UInt8 = 0
