"""TSPWork control surface for Ableton Live 12.

Lets the TSP Work app on this Mac jump to songs and select/zoom song regions.
Install: copy this TSPWork folder to
  ~/Music/Ableton/User Library/Remote Scripts/
then pick "TSPWork" as a Control Surface in Live's Settings > Link, Tempo & MIDI.
"""
import importlib

from . import tspwork


def create_instance(c_instance):
    # Reload so an updated tspwork.py takes effect when the control surface is
    # re-selected (set the slot to None, then back to TSPWork): no restart needed.
    importlib.reload(tspwork)
    return tspwork.TSPWork(c_instance)
