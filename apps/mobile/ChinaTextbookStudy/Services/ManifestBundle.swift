import Foundation

/// A bundle may reuse an immutable asset from an older release in this repo.
struct ManifestBundle: Codable, Hashable {
    let name: String
    let bytes: Int64
    let sha256: String
    var releaseTag: String? = nil

    enum CodingKeys: String, CodingKey {
        case name, bytes, sha256
        case releaseTag = "release_tag"
    }

    func downloadURL(relativeTo base: URL) throws -> URL {
        func safe(_ component: String) -> Bool {
            component.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*$", options: .regularExpression) != nil
        }
        guard safe(name), releaseTag.map(safe) ?? true else {
            throw URLError(.badURL)
        }
        let location = releaseTag.map { base.deletingLastPathComponent().appendingPathComponent($0) } ?? base
        return location.appendingPathComponent(name)
    }
}
