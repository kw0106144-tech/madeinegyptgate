import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let main = MainViewController() // CAPBridgeViewController + new windows, Universal Links, offline page, files
        // started by a link (a Universal Link): that page, not the one kept from the last time (MainViewController.restorePlace)
        main.launchedByLink = !connectionOptions.urlContexts.isEmpty
            || connectionOptions.userActivities.contains { $0.activityType == NSUserActivityTypeBrowsingWeb }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = main
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
