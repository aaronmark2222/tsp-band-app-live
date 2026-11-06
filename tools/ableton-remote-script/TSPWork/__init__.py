"""TSPWork control surface for Ableton Live 12.

Lets the TSP Work app on this Mac jump to songs and select/zoom song regions.
Install: copy this TSPWork folder to
  ~/Music/Ableton/User Library/Remote Scripts/
then pick "TSPWork" as a Control Surface in Live's Settings > Link, Tempo & MIDI.
"""
from .tspwork import TSPWork


def create_instance(c_instance):
    return TSPWork(c_instance)
