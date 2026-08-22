package host.vanilla.demorgan;

import org.bukkit.plugin.java.JavaPlugin;

/** Точка входа. */
public final class DemorganPlugin extends JavaPlugin {

    private PluginConfig config;
    private PunishmentManager manager;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        config = new PluginConfig(getConfig());

        Messages messages = new Messages(getConfig());
        ZoneManager zone = new ZoneManager(this, config);
        zone.prepare();

        manager = new PunishmentManager(this, config, zone, new Storage(this), messages,
                new DiscordLogger(this, config.webhookUrl));
        manager.load();

        getServer().getPluginManager().registerEvents(
                new PrisonListener(this, config, zone, manager, messages), this);

        DemorganCommand command = new DemorganCommand(this, manager, messages);
        registerCommand("demorgan", command);
        registerCommand("unmorgan", command);

        getServer().getScheduler().runTaskTimer(this, manager::tick, 20L, 20L);
        getServer().getScheduler().runTaskTimer(this, manager::save,
                config.saveIntervalSeconds * 20L, config.saveIntervalSeconds * 20L);
    }

    @Override
    public void onDisable() {
        if (manager != null) {
            manager.save();
        }
    }

    private void registerCommand(String name, DemorganCommand handler) {
        var command = getCommand(name);
        if (command == null) {
            getLogger().severe("Команда '" + name + "' не объявлена в plugin.yml");
            return;
        }
        command.setExecutor(handler);
        command.setTabCompleter(handler);
    }

    public PluginConfig config() {
        return config;
    }

    /** Перечитывает config.yml. Геометрия арены применяется только после рестарта. */
    public void reloadPluginConfig() {
        reloadConfig();
        config = new PluginConfig(getConfig());
    }
}
