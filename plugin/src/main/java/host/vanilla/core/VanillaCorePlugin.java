package host.vanilla.core;

import com.google.gson.JsonObject;
import host.vanilla.core.admin.ActionRunner;
import host.vanilla.core.admin.CheckManager;
import host.vanilla.core.admin.MaintenanceWatcher;
import host.vanilla.core.admin.EspManager;
import host.vanilla.core.admin.StaffCommands;
import host.vanilla.core.admin.StaffListener;
import host.vanilla.core.admin.VanishManager;
import host.vanilla.core.api.ApiClient;
import host.vanilla.core.auth.AuthCommands;
import host.vanilla.core.auth.AuthListener;
import host.vanilla.core.auth.AuthManager;
import host.vanilla.core.auth.Profile;
import host.vanilla.core.config.PluginConfig;
import host.vanilla.core.cosmetics.CosmeticCommand;
import host.vanilla.core.cosmetics.CosmeticEngine;
import host.vanilla.core.cosmetics.CosmeticListener;
import host.vanilla.core.economy.PlayerCommands;
import host.vanilla.core.games.CaseCommands;
import host.vanilla.core.games.CaseListener;
import host.vanilla.core.games.CaseShop;
import host.vanilla.core.games.DiceGame;
import host.vanilla.core.punish.JailJobs;
import host.vanilla.core.punish.JailListener;
import host.vanilla.core.punish.JailManager;
import host.vanilla.core.punish.JailZone;
import host.vanilla.core.news.NewsBroadcaster;
import host.vanilla.core.report.ReportManager;
import host.vanilla.core.season.GiveawayNotifier;
import host.vanilla.core.season.SparkManager;
import host.vanilla.core.season.TabList;
import host.vanilla.core.shop.ShopCommands;
import host.vanilla.core.shop.ShopListener;
import host.vanilla.core.shop.ShopManager;
import host.vanilla.core.report.ReportMenuListener;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.GameMode;
import org.bukkit.NamespacedKey;
import org.bukkit.command.CommandExecutor;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Ядро сервера: авторизация, наказания, админка, репорты, экономика. */
public final class VanillaCorePlugin extends JavaPlugin {

    private PluginConfig config;
    private Messages messages;
    private ApiClient api;
    private AuthManager auth;
    private JailZone jailZone;
    private JailManager jail;
    private JailJobs jailJobs;
    private EspManager esp;
    private VanishManager vanish;
    private CheckManager checks;
    private ReportManager reports;
    private NewsBroadcaster news;
    private CosmeticEngine cosmetics;
    private ActionRunner actions;
    private MaintenanceWatcher maintenance;
    private TabList tabList;
    private SparkManager sparks;
    private GiveawayNotifier giveaways;
    private CaseShop caseShop;
    private DiceGame dice;
    private ShopManager shop;
    private ShopCommands shopCommands;
    private CaseListener caseListener;
    private NamespacedKey hatKey;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        config = new PluginConfig(getConfig());
        config.validate().forEach(problem -> getLogger().warning(problem));
        Accounts.setPrefix(config.bedrockPrefix);

        messages = new Messages(this);
        api = new ApiClient(this, config.apiUrl, config.apiToken);
        auth = new AuthManager(this, messages);

        jailZone = new JailZone(this, config);
        jailZone.prepare();
        jail = new JailManager(this, jailZone, messages);
        jailJobs = new JailJobs(this, messages);
        jail.setJobs(jailJobs);

        esp = new EspManager(this);
        vanish = new VanishManager(this, messages);
        checks = new CheckManager(this, messages);
        reports = new ReportManager(this, messages);
        news = new NewsBroadcaster(this, messages);
        hatKey = new NamespacedKey(this, "cosmetic_hat");
        cosmetics = new CosmeticEngine(this);
        actions = new ActionRunner(this, messages);
        maintenance = new MaintenanceWatcher(this, messages);
        tabList = new TabList(this);
        sparks = new SparkManager(this, messages);
        giveaways = new GiveawayNotifier(this, messages);
        caseShop = new CaseShop(this, messages);
        dice = new DiceGame(this, messages);
        shop = new ShopManager(this);
        shopCommands = new ShopCommands(this, messages);

        registerListeners();
        registerCommands();
        scheduleTasks();
    }

    private void registerListeners() {
        var manager = getServer().getPluginManager();
        manager.registerEvents(new AuthListener(this, auth, messages), this);
        manager.registerEvents(new JailListener(this, jail, messages), this);
        manager.registerEvents(jailJobs, this);
        manager.registerEvents(new StaffListener(this, checks), this);
        manager.registerEvents(vanish, this);
        manager.registerEvents(new ReportMenuListener(this, reports), this);
        manager.registerEvents(new CosmeticListener(this, cosmetics), this);
        manager.registerEvents(new ShopListener(this, shopCommands, messages), this);
        caseListener = new CaseListener(this, messages);
        manager.registerEvents(caseListener, this);
    }

    private void registerCommands() {
        AuthCommands authCommands = new AuthCommands(auth, messages);
        bind("login", authCommands);
        bind("2fa", authCommands);

        StaffCommands staff = new StaffCommands(this, messages);
        for (String name : List.of("spec", "esp", "ajail", "unjail", "warn", "ban", "check", "asms",
                "news", "reports", "tp", "tphere", "spark", "a", "chide")) {
            bind(name, staff);
        }

        bind("cosmetics", new CosmeticCommand(this, cosmetics));

        for (String name : List.of("shop", "tpa", "tpaccept", "tpdeny", "sethome", "home", "back",
                "ec", "craft")) {
            bind(name, shopCommands);
        }

        CaseCommands caseCommands = new CaseCommands(this, messages);
        bind("cases", caseCommands);
        bind("cubes", caseCommands);

        PlayerCommands player = new PlayerCommands(this, messages);
        for (String name : List.of("balance", "promo", "bonus", "report", "giveaway")) {
            bind(name, player);
        }
    }

    private void bind(String name, CommandExecutor executor) {
        var command = getCommand(name);
        if (command == null) {
            getLogger().severe("Команда '" + name + "' не объявлена в plugin.yml");
            return;
        }
        command.setExecutor(executor);
        if (executor instanceof org.bukkit.command.TabCompleter completer) {
            command.setTabCompleter(completer);
        }
    }

    private void scheduleTasks() {
        getServer().getScheduler().runTaskTimer(this, jail::tick, 20L, 20L);
        if (config.jailJobsEnabled) {
            // Прораб мог пропасть после рестарта или чистки мира — проверяем.
            getServer().getScheduler().runTaskTimer(this, () -> {
                jailJobs.ensureForeman();
                jailJobs.cleanupLitter();
            }, 100L, 600L);
        }
        getServer().getScheduler().runTaskTimer(this, esp::refresh,
                config.espRefreshSeconds * 20L, config.espRefreshSeconds * 20L);
        getServer().getScheduler().runTaskTimer(this, vanish::tick, 40L, 40L);
        getServer().getScheduler().runTaskTimer(this, this::reportPlaytime, 1200L, 1200L);
        getServer().getScheduler().runTaskTimer(this, news::poll,
                config.newsPollSeconds * 20L, config.newsPollSeconds * 20L);
        // Техработы проверяем чаще новостей: закрытие сервера не должно ждать минуту.
        getServer().getScheduler().runTaskTimer(this, maintenance::poll, 100L,
                config.maintenancePollSeconds * 20L);
        // Поручения с сайта (очистка инвентаря) забираем в том же ритме, что и новости.
        getServer().getScheduler().runTaskTimer(this, actions::poll,
                config.newsPollSeconds * 20L + 40L, config.newsPollSeconds * 20L);
        // Частицы рисуем четыре раза в секунду: чаще — лишняя нагрузка, реже — рвано.
        getServer().getScheduler().runTaskTimer(this, cosmetics::tick, 20L, 5L);

        // Косметику перечитываем на ходу: игрок надевает её на сайте и ждёт,
        // что она появится в игре, а не после перезахода.
        if (config.cosmeticRefreshSeconds > 0) {
            getServer().getScheduler().runTaskTimer(this, this::refreshCosmetics, 200L,
                    config.cosmeticRefreshSeconds * 20L);
        }

        if (config.tabEnabled) {
            getServer().getScheduler().runTaskTimer(this, tabList::refresh, 40L,
                    config.tabRefreshSeconds * 20L);
        }
        if (config.giveawayNotifySeconds > 0) {
            getServer().getScheduler().runTaskTimer(this, giveaways::broadcast,
                    config.giveawayNotifySeconds * 20L, config.giveawayNotifySeconds * 20L);
        }
        if (config.sparkEnabled) {
            getServer().getScheduler().runTaskTimer(this, sparks::tick, 60L, 4L);
            getServer().getScheduler().runTaskTimer(this, sparks::spawn,
                    config.sparkIntervalSeconds * 20L, config.sparkIntervalSeconds * 20L);
        }
    }

    /** Раз в минуту отправляем наигранное время — из него считается уровень аккаунта. */
    private void reportPlaytime() {
        List<Map<String, Object>> entries = new ArrayList<>();
        for (Player player : getServer().getOnlinePlayers()) {
            if (!auth.authenticated(player)) continue;
            entries.add(Map.of("login", Accounts.name(player), "seconds", 60));
        }
        if (!entries.isEmpty()) {
            api.post("/api/mc/playtime", Map.of("entries", entries));
        }
    }

    /** Игрок ввёл пароль: подтягиваем профиль и применяем всё, что из него следует. */
    public void onPlayerAuthenticated(Player player) {
        api.onMain(api.get("/api/mc/profile?login=" + Accounts.name(player)), response -> {
            if (!player.isOnline() || response.get("_status").getAsInt() != 200) return;

            Profile profile = auth.profile(player);
            profile.setAdminLevel(response.get("adminLevel").getAsInt());
            if (response.has("rank") && response.get("rank").isJsonObject()) {
                JsonObject rank = response.getAsJsonObject("rank");
                profile.setRank(
                        rank.get("prefix").isJsonNull() ? null : rank.get("prefix").getAsString(),
                        rank.get("color").isJsonNull() ? null : rank.get("color").getAsString());
            }
            profile.setLevel(response.get("level").getAsInt());
            profile.setBalanceVc(response.get("balanceVc").getAsInt());

            applyRole(player, profile.adminLevel());
            // Проверяем сразу после входа: уровень админки известен только теперь.
            if (maintenance.kickIfNeeded(player)) return;
            tabList.welcome(player);
            // Плашку о розыгрыше показываем с задержкой: сразу после входа
            // игрок читает приветствие и подсказки по авторизации.
            getServer().getScheduler().runTaskLater(this, () -> {
                if (player.isOnline()) giveaways.show(player, false);
            }, 100L);

            if (response.has("cosmetics") && response.get("cosmetics").isJsonArray()) {
                cosmetics.apply(player, response.getAsJsonArray("cosmetics"));
                cosmetics.playJoinEffect(player);
            }

            shop.refresh(player);

            if (response.has("jail") && !response.get("jail").isJsonNull()) {
                JsonObject jailData = response.getAsJsonObject("jail");
                jail.restore(player, jailData);
            }
        });
    }

    private void applyRole(Player player, int adminLevel) {
        esp.applyRole(player, adminLevel);
        refreshDisplayName(player);

        // Администрация всегда в наблюдателе: так проверки не превращаются в игру
        // за одну из сторон, а сам админ не может ничего сломать в мире.
        if (adminLevel >= 2 && config.staffAlwaysSpectator && !jail.isJailed(player)) {
            player.setGameMode(GameMode.SPECTATOR);
        }
    }

    /** Имя в чате и в списке: метка ранга плюс купленный цвет ника. */
    public void refreshDisplayName(Player player) {
        // Метку и её цвет задают в панели, поэтому берём их из профиля. Если
        // сайт ничего не прислал (старый ответ, ранг без метки) — падаем на
        // встроенные названия уровней.
        Profile profile = auth.profile(player);
        String prefix;
        if (profile.rankPrefix() != null && !profile.rankPrefix().isBlank()) {
            String color = profile.rankColor() == null || profile.rankColor().isBlank()
                    ? defaultRankColor(auth.adminLevel(player))
                    : profile.rankColor();
            prefix = "<color:" + color + ">[" + profile.rankPrefix() + "]</color> ";
        } else {
            prefix = switch (auth.adminLevel(player)) {
                case 2 -> "<yellow>[HELPER]</yellow> ";
                case 3 -> "<red>[ADMIN]</red> ";
                case 4 -> "<light_purple>[PR]</light_purple> ";
                case 5 -> "<dark_red>[Chief Admin]</dark_red> ";
                default -> "";
            };
        }

        Component nick = Component.text(player.getName());
        net.kyori.adventure.text.format.TextColor color = cosmetics.nameColor(player);
        nick = color != null ? nick.color(color) : nick.color(net.kyori.adventure.text.format.NamedTextColor.WHITE);

        Component name = prefix.isEmpty() ? nick : Messages.mm(prefix).append(nick);
        player.displayName(name);
        player.playerListName(name);
    }

    /** Цвет метки, если в панели его не задали. */
    private static String defaultRankColor(int adminLevel) {
        return switch (adminLevel) {
            case 2 -> "#ffe873";
            case 3 -> "#ff6b6b";
            case 4 -> "#d98cff";
            case 5 -> "#a01414";
            default -> "#9aa3b2";
        };
    }

    /** Перечитывает косметику игрока с сайта — после покупки или смены предмета. */
    /** Перечитывает косметику всем, кто в сети: набор мог поменяться на сайте. */
    private void refreshCosmetics() {
        for (Player player : getServer().getOnlinePlayers()) {
            if (auth.authenticated(player)) reloadCosmetics(player);
        }
    }

    public void reloadCosmetics(Player player) {
        api.onMain(api.get("/api/mc/profile?login=" + Accounts.name(player)), response -> {
            if (!player.isOnline() || response.get("_status").getAsInt() != 200) return;
            if (response.has("cosmetics") && response.get("cosmetics").isJsonArray()) {
                cosmetics.apply(player, response.getAsJsonArray("cosmetics"));
            }
        });
    }

    public void onPlayerQuit(Player player) {
        jail.syncOnQuit(player);
        cosmetics.forget(player);
        shop.forget(player);
        checks.onQuit(player);
        esp.disable(player);
    }

    /** Пишет действие администрации в журнал сайта. */
    public void logAdminAction(Player admin, String action, String targetLogin, Map<String, ?> meta) {
        Map<String, Object> body = new HashMap<>();
        if (admin != null) body.put("actorLogin", Accounts.name(admin));
        body.put("action", action);
        if (targetLogin != null) body.put("targetLogin", targetLogin);
        body.put("meta", meta);
        api.post("/api/mc/audit", body);
    }

    @Override
    public void onDisable() {
        for (Player player : getServer().getOnlinePlayers()) {
            jail.syncOnQuit(player);
        }
        if (cosmetics != null) cosmetics.shutdown();
    }

    public PluginConfig config() { return config; }
    public ApiClient api() { return api; }
    public AuthManager auth() { return auth; }
    public JailManager jail() { return jail; }
    public EspManager esp() { return esp; }
    public VanishManager vanish() { return vanish; }
    public CheckManager checks() { return checks; }
    public ReportManager reports() { return reports; }
    public NewsBroadcaster news() { return news; }
    public CosmeticEngine cosmetics() { return cosmetics; }
    public ShopManager shop() { return shop; }
    public ActionRunner actions() { return actions; }
    public MaintenanceWatcher maintenance() { return maintenance; }
    public SparkManager sparks() { return sparks; }
    public GiveawayNotifier giveaways() { return giveaways; }
    public JailJobs jailJobs() { return jailJobs; }
    public CaseShop cases() { return caseShop; }
    public CaseListener caseOpening() { return caseListener; }
    public DiceGame dice() { return dice; }
    public TabList tabList() { return tabList; }
    public NamespacedKey hatKey() { return hatKey; }
    public Messages messages() { return messages; }
}
