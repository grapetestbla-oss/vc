package host.vanilla.demorgan;

import org.bukkit.generator.ChunkGenerator;

/** Пустой мир: всё, что в нём есть, ставит сам плагин. */
public final class VoidGenerator extends ChunkGenerator {

    @Override public boolean shouldGenerateNoise() { return false; }
    @Override public boolean shouldGenerateSurface() { return false; }
    @Override public boolean shouldGenerateCaves() { return false; }
    @Override public boolean shouldGenerateDecorations() { return false; }
    @Override public boolean shouldGenerateMobs() { return false; }
    @Override public boolean shouldGenerateStructures() { return false; }
}
