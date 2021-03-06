'use strict';

var extend = require('extend')
var aabb = require('aabb-3d')
var vec3 = require('gl-vec3')
var EntitySystem = require('ensy')

module.exports = function (noa, opts) {
	return new Entities(noa, opts)
}

var defaults = {
	shadowDistance: 10,
}


/**
 * Wrangles entities. 
 * Encapsulates an ECS. Exposes helpers for adding entities, components, 
 * and getting component data for entities. 
 * 
 * Expects entity definitions in a specific format - see source `components` folder for examples.
 * 
 * @class noa.entities
*/

function Entities(noa, opts) {
	this.noa = noa
	opts = extend(defaults, opts)
	
	// internals
	this.shadowDist = opts.shadowDistance
	this._toRemove = []
	
	// set up ECS and built-in components
	this.ecs = new EntitySystem()
	/** Collection of known components */
	this.components = {}
	this.processors = {}
	this.renderProcessors = {}
	this._renderProcList = []
	setupComponents(this)

	var self = this
	noa.on('beforeRender', function (dt) {
		doRenderProcessors(self, dt) 
	})
	noa.on('tick', function (dt) { tick(self, dt) })
}




/*
 *
 *    ECS API - hides/encapsulates ensy library
 *
*/

/**
 * Creates a new component from a definiton object
 * @param comp
 */
Entities.prototype.createComponent = function (comp) {
	
	this.ecs.addComponent(comp.name, comp)

	var ecs = this.ecs
	if (comp.processor) {
		this.processors[comp.name] = {
			update: function innerProcessor(dt) {
				comp.processor(dt, ecs.getComponentsData(comp.name))
			}
		}
		this.ecs.addProcessor(this.processors[comp.name])
	}
	
	if (comp.renderProcessor) {
		this.renderProcessors[comp.name] = function innerRenderProc(dt) {
			comp.renderProcessor(dt, ecs.getComponentsData(comp.name))
		}
		this._renderProcList.push(this.renderProcessors[comp.name])
	}
}

/** @param comp */
Entities.prototype.deleteComponent = function (comp) {
	var name = (typeof comp === 'string') ? comp : comp.name
	if (this.processors[name]) {
		this.ecs.removeProcessor(this.processors[name])
		delete this.processors[name]
	}
	if (this.renderProcessors[name]) {
		var i = this._renderProcList.indexOf(this.renderProcessors[name])
		this._renderProcList.splice(i,1)
		delete this.renderProcessors[name]
	}
	return this.ecs.removeComponent(name)
}

/** 
 * Takes an array of components to add (per `addComponent`)
 * @param compList */
Entities.prototype.createEntity = function (compList) {
	var eid = this.ecs.createEntity([])
	if (compList && compList.length) {
		for (var i = 0; i < compList.length; ++i) {
			this.addComponent(eid, compList[i])
		}
	}
	return eid
}

/** 
 * deletes an entity, after removing all its components
 * @param id */
Entities.prototype.removeEntity = function (entID) {
	// manually remove components so that callbacks can fire
	var compNames = this.ecs.getComponentsList()
	for (var i = 0; i < compNames.length; ++i) {
		var name = compNames[i]
		if (this.ecs.entityHasComponent(entID, name)) {
			this.removeComponent(entID, name)
		}
	}
	return this.ecs.removeEntity(entID)
}

/**
 * Add component to an entity. Optional `state` param can be only partially populated.
 * @param id
 * @param comp
 * @param state
 */
Entities.prototype.addComponent = function (entID, comp, data) {
	var name = (typeof comp === 'string') ? comp : comp.name
	
	if (this.ecs.entityHasComponent(entID, name)) {
		this.removeComponent(entID, name)
	}
	
	tmpArray[0] = name
	this.ecs.addComponentsToEntity(tmpArray, entID)

	var compData = this.ecs.getComponentDataForEntity(name, entID)
	if (data) {
		for (var s in data) {
			if (!compData.hasOwnProperty(s)) throw new Error("Supplied data object doesn't match component data")
			compData[s] = data[s]
		}
	}
	var compDef = this.ecs.components[name]
	if (compDef.onAdd) compDef.onAdd(entID, compData)
}
var tmpArray = ['foo']

/**
 * Remove a component from an entity
 * @param id
 * @param comp
 */
Entities.prototype.removeComponent = function (entID, comp) {
	if (comp.length && typeof comp === 'object') throw new Error("Remove one component at a time..")

	var name = (typeof comp === 'string') ? comp : comp.name
	var compDef = this.ecs.components[name]
	if (compDef.onRemove) {
		var compData = this.ecs.getComponentDataForEntity(name, entID)
		compDef.onRemove(entID, compData)
	}
	return this.ecs.removeComponentsFromEntity([name], entID)
}

/**
 * @param id
 * @param comp
 */
Entities.prototype.hasComponent = function (entID, comp) {
	var name = (typeof comp === 'string') ? comp : comp.name
	return this.ecs.entityHasComponent(entID, name)
}

/**
 * Get state data for an entity's component 
 * @param id
 * @param comp
 */
Entities.prototype.getData = function (entID, comp) {
	var name = (typeof comp === 'string') ? comp : comp.name
	return this.ecs.getComponentDataForEntity(name, entID)
}

/**
 * Get array of state objects for all entities having a given component 
 * @param comp
 */
Entities.prototype.getDataList = function (comp) {
	var name = (typeof comp === 'string') ? comp : comp.name
	return this.ecs.getComponentsData(name)
}

// Accessor for 'systems' to map a function over each item in a component data list
// takes: function(componentData, id) 
// breaks early if fn() returns false
Entities.prototype.loopOverComponent = function (comp, fn) {
	var name = (typeof comp === 'string') ? comp : comp.name
	var ents = this.ecs.getComponentsData(name)
	for (var i = 0; i < ents.length; ++i) {
		var dat = ents[i]
		var res = fn(dat, dat.__id)
		if (res === false) return false
	}
	return true
}

Entities.prototype.update = function (dt) {
	this.ecs.update(dt)
}



/*
 *
 *		BUILT IN COMPONENTS
 *
*/

function setupComponents(self) {
	var comps = self.components
	var noa = self.noa

	comps.position = require('../components/position')(noa)
	comps.physics = require('../components/physics')(noa)
	comps.followsEntity = require('../components/followsEntity')(noa)
	comps.mesh = require('../components/mesh')(noa)
	comps.shadow = require('../components/shadow')(noa)
	comps.player = require('../components/player')(noa)
	comps.collideTerrain = require('../components/collideTerrain')(noa)
	comps.collideEntities = require('../components/collideEntities')(noa)
	comps.every = require('../components/every')(noa)
	comps.autoStepping = require('../components/autostepping')(noa)
	comps.movement = require('../components/movement')(noa)
	comps.receivesInputs = require('../components/receivesInputs')(noa)
	comps.fadeOnZoom = require('../components/fadeOnZoom')(noa)

	var names = Object.keys(comps)
	for (var i = 0; i < names.length; i++) {
		self.createComponent(comps[names[i]])
	}
}



/*
 *  Built-in component data accessors
 *	Hopefully monomorphic and easy to optimize..
*/

/** test if entity is the player
 * @param id */
Entities.prototype.isPlayer = function (eid) {
	return this.hasComponent(eid, this.components.player)
}

/** get an entity's bounding box. (treat it as read-only!)
 * @param id */
Entities.prototype.getAABB = function (eid) {
	return this.getData(eid, this.components.position).aabb
}

/** get an entity's position component data (pos at bottom center, width, height)
 * @param id */
Entities.prototype.getPositionData = function (eid) {
	return this.getData(eid, this.components.position)
}


/** get reference to an entity's physics body
 * @param id */
Entities.prototype.getPhysicsBody = function (eid) {
	return this.getData(eid, this.components.physics).body
}
/** returns `{mesh, offset}`
 * @param id */
Entities.prototype.getMeshData = function (eid) {
	return this.getData(eid, this.components.mesh)
}




/*
 *
 *    ENTITY MANAGER API
 *
*/

/** @param x,y,z */
Entities.prototype.isTerrainBlocked = function (x, y, z) {
	// checks if terrain location is blocked by entities
	var newbb = new aabb([x, y, z], [1, 1, 1])
	var datArr = this.getDataList(this.components.collideTerrain)
	for (var i = 0; i < datArr.length; i++) {
		var bb = this.getAABB(datArr[i].__id)
		if (newbb.intersects(bb) && !newbb.touches(bb)) return true;
	}
	return false
}


// Add a new entity, and automatically populates the main components 
// based on arguments if they're present
/** 
 *   Helper to set up a general entity
 * 
 *   Parameters: position, width, height, mesh, meshOffset, doPhysics, shadow
 * 
 * @param position
 * @param width
 * @param height..
 */
Entities.prototype.add = function (position, width, height, // required
	mesh, meshOffset,
	doPhysics, shadow) {
		
	var comps = this.components
	var self = this
	
	// new entity
	var eid = this.createEntity()
		  
	// position component
	this.addComponent(eid, comps.position, {
		position: position, 
		width: width,
		height: height
	})
		
	// rigid body in physics simulator
	if (doPhysics) {
		// body = this.noa.physics.addBody(box)
		this.addComponent(eid, comps.physics)
		var body = this.getPhysicsBody(eid)
		body.aabb = this.getAABB(eid)
		
		// handler for physics engine to call on auto-step
		body.onStep = function () {
			self.addComponent(eid, self.components.autoStepping)
		}
	}	
	
	// mesh for the entity
	if (mesh) {
		if (!meshOffset) meshOffset = vec3.create()
		this.addComponent(eid, comps.mesh, {
			mesh: mesh,
			offset: meshOffset
		})
	}
	
	// add shadow-drawing component
	if (shadow) {
		this.addComponent(eid, comps.shadow, { size: width })
	}
	
	return eid
}


/**
 * Queues an entity to be removed next tick
 */
Entities.prototype.remove = function (eid) {
	// defer removal until next tick function, since entities are likely to
	// call this on themselves during collsion handlers or tick functions
	if (this._toRemove.indexOf(eid) < 0) this._toRemove.push(eid);
}






/*
*
*  INTERNALS
*
*/



function tick(self, dt) {
	// handle any deferred entities that need removing
	while (self._toRemove.length) {
		var eid = self._toRemove.pop()
		self.removeEntity(eid)
	}
}


function doRenderProcessors(self, dt) {
	for (var i=0; i<self._renderProcList.length; i++) {
		self._renderProcList[i](dt)
	}
}








