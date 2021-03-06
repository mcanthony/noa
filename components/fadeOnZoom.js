'use strict';

/**
 * Component for the player entity, when active hides the player's mesh 
 * when camera zoom is less than a certain amount
 */

module.exports = function (noa) {
	return {

		name: 'fade-on-zoom',

		state: {
			cutoff: 2.999,
			_showing: true
		},

		onAdd: null,

		onRemove: null,

		processor: function fadeOnZoomProc(dt, states) {
			var zoom = noa.rendering._currentZoom
			var ents = noa.entities
			for (var i = 0; i < states.length; i++) {
				var state = states[i]
				checkZoom(state, state.__id, zoom, ents)
			}
		}
	}
}


function checkZoom(state, id, zoom, ents) {
	if (!ents.hasComponent(id, ents.components.mesh)) return

	if (state._showing && zoom < state.cutoff || !state._showing && zoom > state.cutoff) {
		var mesh = ents.getMeshData(id).mesh
		mesh.visibility = state._showing = (zoom > state.cutoff)
	}
}


