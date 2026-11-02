import XCTest
@testable import ChinaTextbookStudy

final class ManifestBundleTests: XCTestCase {
    private let base = URL(string: "https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.3-ios-resources")!

    func testLegacyManifestKeepsItsOwnReleaseBase() throws {
        let data = Data(#"{"name":"data-g1up.zip","bytes":1,"sha256":"fixture"}"#.utf8)
        let bundle = try JSONDecoder().decode(ManifestBundle.self, from: data)
        XCTAssertNil(bundle.releaseTag)
        XCTAssertEqual(try bundle.downloadURL(relativeTo: base), base.appendingPathComponent("data-g1up.zip"))
    }

    func testReusedBundleUsesOriginalTagWithoutChangingRepository() throws {
        let data = Data(#"{"name":"audio-ios-g1up.zip","bytes":1,"sha256":"fixture","release_tag":"v1.8.0-ios-resources"}"#.utf8)
        let bundle = try JSONDecoder().decode(ManifestBundle.self, from: data)
        XCTAssertEqual(try bundle.downloadURL(relativeTo: base).absoluteString,
            "https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.0-ios-resources/audio-ios-g1up.zip")
    }

    func testUnsafeNamesAndTagsAreRejected() {
        for name in ["../data.zip", "/data.zip", "data.zip?x=1", "data\\evil.zip"] {
            XCTAssertThrowsError(try ManifestBundle(name: name, bytes: 1, sha256: "fixture").downloadURL(relativeTo: base))
        }
        for tag in ["../escape", "https://example.com", "v1?x=1", ".."] {
            XCTAssertThrowsError(try ManifestBundle(name: "data.zip", bytes: 1, sha256: "fixture", releaseTag: tag).downloadURL(relativeTo: base))
        }
    }
}
