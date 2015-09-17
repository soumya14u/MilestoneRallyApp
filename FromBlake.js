var types = Ext.data.Types;
Ext.define('MilestoneTreeModel', {
	extend: 'Ext.data.TreeModel',
	fields: [
                {name: 'FormattedID', mapping: 'FormattedID', type: types.STRING},
                {name: 'Name', mapping: 'Name', type: types.STRING},
                {name: 'TargetDate', mapping: 'AcceptedDate', type: types.DATE },
                {name: 'TargetProject', mapping: 'TargetProject', type: types.OBJECT},
                {name: 'ValueStream', mapping: 'ValueStream', type: types.STRING},
                {name: 'Visibility', mapping: 'Visibility', type: types.STRING},
                {name: 'Status', mapping: 'Status', type: types.STRING},
                {name: 'DisplayColor', mapping: 'DisplayColor', type: types.STRING},
                {name: 'Notes', mapping: 'Notes', type: types.STRING},
                {name: '_ref', mapping: '_ref', type: types.STRING}
            ],
    hasMany: {model: 'FeatureTreeModel', name:'features', associationKey: 'features'}
});

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    getSettingsFields: function() {
        return [
            {
                name: 'executiveVisibilityOnly',
                xtype: 'rallycheckboxfield',
                fieldLabel: '',
                boxLabel: 'Only show Milestones with Executive Visibility'    
            },
            {
                name: 'includeGlobalMilestones',
                xtype: 'rallycheckboxfield',
                fieldLabel: '',
                boxLabel: 'Include global milestones'
            },
            {
                name: 'showNumberOfMonths',
                xtype: 'rallynumberfield',
                fieldLabel: 'Date Range (months)'
            }
        ];
    },
    
    launch: function() {
        this._getAllChildProjectsForCurrentProject(this.project);
    },
    
    _getAllChildProjectsForCurrentProject: function(currProject){
        Ext.getBody().mask('Loading...');
        
        this.allProjectsList = [];
        var that = this;
        var projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'State', 'Parent', 'Children'],
            autoLoad: true,
            compact: false,
            context: {
                workspace: that.getContext().getWorkspace()._Ref,
                projectScopeUp: false,
                projectScopeDown: true
            },
            limit: Infinity,
            filters:[{
                property:'State',
                operator: '=',
                value: 'Open'
            }],
            sorters: [{
                property: 'Name',
                direction: 'ASC'
            }],
            listeners: {
                load: function(projectStore, data, success){
                    //initiatilinzing the list containing the required and all projects.
                    this.requiredProjectsList = [];
                    this.allProjectsColl = data;
                    
                    //identifying the selected project and constructing its reference.
                    var selectedProj = this.getContext().getProject();
                    var selectedProjRef = '/project/' + selectedProj.ObjectID;
                        
                    //registering the selected project reference.
                    this.requiredProjectsList.push(selectedProj.ObjectID);
                        
                    //identifying whether selected project has any children.
                    var selectedProjChildren = selectedProj.Children;
                    if(selectedProjChildren && selectedProjChildren.Count > 0){
                        this._loadAllChildProjectsFromParent(selectedProjRef);
                    }
                    
                    //creating the milestone Store Filter.
                    this._createMilestoneStoreFilter();
                             
                    //creating Milestone store.
                    this._createMilestoneStore();
                    
                    Ext.getBody().unmask();
                },
                scope: this
            }
         });
    },
    
    _loadAllChildProjectsFromParent: function(parentProjRef) {
        var that = this;
        
        Ext.Array.each(this.allProjectsColl, function(thisProject) {
            //identifying current project is child of the Project with reference..
            if(thisProject.get('Parent') && thisProject.get('Parent')._ref !== null && thisProject.get('Parent')._ref == parentProjRef){
                that.requiredProjectsList.push(thisProject.data.ObjectID);
                
                //identifying whether the project as any further children.
                var projChildren = thisProject.get('Children');
                if(projChildren && projChildren.Count > 0){
                    that._loadAllChildProjectsFromParent(thisProject.get('_ref'));
                }
            }
        });
    },
    
    _createMilestoneStoreFilter: function(){
        this.projectMilestoneFilter =  Ext.create('Rally.data.wsapi.Filter', {
                                    property: 'TargetDate',
                                    operator: '>=',
                                    value: 'today'
                                });
        
        this.projectMilestoneFilter = this.projectMilestoneFilter.and(Ext.create('Rally.data.wsapi.Filter', {
                property: 'Name',
                operator: '=',
                value: 'AP Invoice Approval 1.1'
        }));
        
        //only apply filtering on the notes field if configured
        if (this.getSetting('executiveVisibilityOnly')) {
            this.projectMilestoneFilter = this.projectMilestoneFilter.and(Ext.create('Rally.data.wsapi.Filter', {
                                    property: 'c_ExecutiveVisibility',
                                    operator: '=',
                                    value: this.getSetting('executiveVisibilityOnly')
                                }));
        }
        
        //only filter on date range if configured
        if (this.getSetting('showNumberOfMonths') && this.getSetting('showNumberOfMonths') > 0) {
            var endDate = Rally.util.DateTime.add(new Date(), "month", this.getSetting('showNumberOfMonths'));
            
            this.projectMilestoneFilter = this.projectMilestoneFilter.and(Ext.create('Rally.data.wsapi.Filter', {
                property: 'TargetDate',
                operator: '<=',
                value: endDate
            }));
        }
    },
    
    _createMilestoneStore: function() {
        var milestones = Ext.create('Rally.data.wsapi.Store', {
            model: 'milestone',
            fetch: ['Artifacts', 'FormattedID', 'Name', 'TargetProject', 'TargetDate', 'DisplayColor', 'Notes', 'c_ValueStream', 'c_ExecutiveVisibility'],
            compact: false,
            filters : this.projectMilestoneFilter,
            context: {
                workspace: this.getContext().getWorkspace()._Ref,
                projectScopeUp: false,
                projectScopeDown: true
            },
            sorters: [
                {
                    property: 'c_ValueStream',
                    direction: 'ASC'
                },
                {
                    property: 'TargetDate',
                    direction: 'ASC'
                }
            ]
        });
        
        milestones.load().then({
            success: this._loadMilestoneArtifacts,
            scope: this
        }).then({
            success: function(milestones) {
                this._filterMilestones(milestones);
            },
            failure: function(error) {
                console.log('Unable to load store: ' + error);
            },
            scope: this
        });
    },
    
    _loadMilestoneArtifacts: function(milestones) {
        _.each(milestones, function(milestone) {
            
            var artifacts = milestone.get('Artifacts');
            if(artifacts.Count > 0) {
                artifacts.store = milestone.getCollection('Artifacts');
                //artifacts.store.load();
            }
        });
        
        //return milestones with loaded artifacts
        return milestones;
    },
    
    //Only include milestones based on the current project and it's children
    _filterMilestones: function(myData) {
        var that = this;
        //Filter out milestone will be stored here
        var filteredMilestonesArr = [];
        
        Ext.each(myData, function(data, index) {
            var targetProject = data.data.TargetProject;
            
            if(that.getSetting('includeGlobalMilestones') && (targetProject === null || targetProject === "")){
                filteredMilestonesArr.push(data);
            }
            else if(targetProject !== null && targetProject !== "" && targetProject._ref !== null){
                var projectObjectId =that._getTargetProjectObjectIDFromRef(targetProject._ref);
                if(that.requiredProjectsList.indexOf(projectObjectId) > -1)
                    filteredMilestonesArr.push(data);
            }
        });
        
        if (filteredMilestonesArr.length <= 0) {
            Rally.ui.notify.Notifier.show({message: 'No data found for selected filters.'});
            return;
        }
        else {
            this._organiseMilestoneBasedOnValuestream(filteredMilestonesArr);
        }
    },
    
    _organiseMilestoneBasedOnValuestream: function(filteredMilestonesArr){
        this.valueStreamMilestoneColl = [];
        this.valueStreamColl = [];
        var nonVSCount = 0;
        var that = this;
        
        Ext.Array.each(filteredMilestonesArr, function(thisData){
            var valuestream = thisData.get('c_ValueStream');
            
            if(valuestream !== ''){
                if(that.valueStreamColl.length === 0){
                    that.valueStreamColl.push(valuestream);
                }
                else if(that.valueStreamColl.length > 0 && that.valueStreamColl.indexOf(valuestream) === -1){
                    that.valueStreamColl.push(valuestream);
                }
            }
            else{
                nonVSCount++;
            }
        });
        
        this.valueStreamColl.sort();
        
        if(nonVSCount > 0) {
            this.valueStreamColl.push('N/A');
        }
        
        Ext.Array.each(this.valueStreamColl, function(valuestream) {
            var milestoneColl = that._getAllAssociatedMilestones(valuestream, filteredMilestonesArr);
            
            that.valueStreamMilestoneColl.push({
                key: valuestream,
                value: milestoneColl
            });
        });
        
        this._createValueStreamMilestonesTreeNode();
    },
    
    _createValueStreamMilestonesTreeNode: function(){
        
        var valueStreamRootNode = Ext.create('MilestoneTreeModel',{
                    Name: 'ValueStream Root',
                    text: 'ValueStream Root',
                    root: true,
                    expandable: true,
                    expanded: true
                });
                
        this._createValueStreamNodesAlongWithAssociatedChildMilestoneNodes(valueStreamRootNode);
        
        this._createValueStreamMilestoneGrid(valueStreamRootNode);
        
    },
    
    _createValueStreamMilestoneGrid: function(valueStreamRootNode){
        
       var milestoneValueStreamTreeStore = Ext.create('Ext.data.TreeStore', {
            model: 'MilestoneTreeModel',
            root: valueStreamRootNode
        }); 
        
       var valuestreamMilestoneTreePanel = Ext.create('Ext.tree.Panel', {
            store: milestoneValueStreamTreeStore,
            useArrows: true,
            rowLines: true,
            displayField: 'Name',
            rootVisible: false,
            width: '100%',
            height: 'auto', // Extra scroll for individual sections:
            viewConfig: {
                getRowClass: function(record, index) {
                    var nameRecord = Ext.String.format("{0}", record.get('Name'));
                    if(nameRecord && nameRecord.search('valuestream:') === -1){
                        return 'row-child';
                    }
                    return 'row-parent';
                }
            },
            columns: [{
                          xtype: 'treecolumn',
                          text: 'Name',
                          dataIndex: 'Name',
                          resizeable: true,
                          flex: 3,
                          minWidth:200,
                          //width : 300,
                          renderer: function(value,style,item,rowIndex) {
                                var link = Ext.String.format("{0}", value);
                                if(link.search('valuestream:') === -1){
                                    var ref = item.get('_ref');
                                    link = Ext.String.format("<a target='_top' href='{1}'><b>{0}</b></a>", value, Rally.nav.Manager.getDetailUrl(ref));
                                }
                                else{
                                    var onlyName = link.replace('valuestream:', '');
                                    link= Ext.String.format("<b>{0}</b>", onlyName);
                                }
                                    
                                return link;
                            }
                    },
                    {
                        text: 'Project', 
                        dataIndex: 'TargetProject',
                        flex: 2,
                        hidden: true
                    },
                    {
                        text: 'Target Date', 
                        dataIndex: 'TargetDate',
                        flex: 1,
                        renderer: function(value){
                            if(value)
                                return Rally.util.DateTime.format(value, 'M Y');
                        }
                    },
                    {
                        text: 'Status',
                        dataIndex: 'DisplayColor',
                        flex: 1,
                        renderer: function(value){
                            if(value){ 
                                var colorHtml = Ext.String.format("<div class= 'color-box' style= 'background-color: {0};'></div>", value);
                                return colorHtml;
                            }
                        }
                    },
                    {
                        text: 'Notes',
                        dataIndex: 'Notes',
                        flex: 5
                    }
                ]
        });
        
        this.add(valuestreamMilestoneTreePanel);
    },
    
    _createValueStreamNodesAlongWithAssociatedChildMilestoneNodes: function(valustreamRootNode){
        var that = this;
        
        Ext.Array.each(this.valueStreamMilestoneColl, function(thisData) {
            var valueStreamNode = that._createValueStreamNode(thisData.key);
            
            Ext.Array.each(thisData.value, function(thisMilestoneData) {
                var milestoneNode = that._createMilestoneNode(thisMilestoneData);
                valueStreamNode.appendChild(milestoneNode);
            });
            
            valustreamRootNode.appendChild(valueStreamNode);
        });
    },
    
    _createValueStreamNode: function(valuestreamData){
        var valueStreamLable = 'valuestream: ' + valuestreamData;
        var valustreamTreeNode = Ext.create('MilestoneTreeModel',{
                    Name: valueStreamLable,
                    leaf: false,
                    expandable: true,
                    expanded: true,
                    iconCls :'no-icon'
                });
                
        return  valustreamTreeNode;
    },
    
    _createMilestoneNode: function(milestoneData){
        var targetProjectName = milestoneData.get('TargetProject') !== null ?  milestoneData.get('TargetProject')._refObjectName : 'Global';
        
        var milestoneTreeNode = Ext.create('MilestoneTreeModel',{
            FormattedID: milestoneData.get('FormattedID'),
            Name: milestoneData.get('Name'),
            TargetDate: milestoneData.get('TargetDate'),
            TargetProject: targetProjectName,
            DisplayColor: milestoneData.get('DisplayColor'),
            Notes: milestoneData.get('Notes'),
            _ref: milestoneData.get('_ref'),
            leaf: true,
            expandable: false,
            expanded: false,
            iconCls :'no-icon'
        });
                
        this._createArtifactNodesForMilestone(milestoneData, milestoneTreeNode);
        
        return milestoneTreeNode;
    },
    
    _createArtifactNodesForMilestone: function(milestoneData, milestoneNode) {
        var that = this;
        var totalLeafNodes = 0, acceptedLeafNodes = 0;
            
        console.log(milestoneData);
        console.log('artifact store...');
        var artifactTreeNodeCollection = [];
        
        milestoneData.getCollection('Artifacts').load({
                fetch: ['FormattedID', 'Name', '_type', 'ObjectID'],
                callback: function(records, operation, success) {
                    Ext.Array.each(records, function(artifact) {
                        //create a model based on the type and load
                        var model = Rally.data.ModelFactory.getModel({
                            type: artifact.get('_type'),
                            success: function(model) {
                                model.load(artifact.get('ObjectID'), {
                                    callback: function(result, operation) {
                                        if(operation.wasSuccessful()) {
                                            that.totalLeafNodes += result.get('AcceptedLeafStoryCount');
                                            that.acceptedLeafNodes += result.get('AcceptedLeafStoryCount');
                                            console.log('got feature; # of stories:' + result.get('LeafStoryCount'));
                                            
                                            
                                        }
                                    }
                                }); 
                            },
                            scope: this
                        });
                    });
                }
        }).then({
            success: function() {
                console.log('Total Stories for Milestone: ' + that.totalLeafNodes);
            },
            scope: this
        });
/*        
        Ext.Array.each(artifacts, function(artifact) {
            console.log(artifact);
        });

            if (artifact.isPortfolioItem) {
            
                var portfolioModel = Rally.data.ModelFactory.getModel({
                    type: artifact.get('_type')    
                });
                
                portfolioModel.load(objectId).then({
                    success: function(result, operation) {
                        console.log(result);
                    },
                    scope: this
                });
                
                
                
                //create a model based on the type and load
                var model = Rally.data.ModelFactory.getModel({
                    type: artifact.get('_type'),
                    success: function(model) {
                        model.load(objectId, {
                            callback: function(result, operation) {
                                if(operation.wasSuccessful()) {
                                    totalLeafNodes += artifact.get('AcceptedLeafStoryCount');
                                    acceptedLeafNodes += artifact.get('AcceptedLeafStoryCount');
                                }
                            }
                        }); 
                    },
                    scope: this
                });

                var artifactNode = Ext.create('ArtifactTreeModel', {
                    FormattedID: artifact.get('FormattedID'),
                    Name: artifact.get('Name'),
                    TotalLeafArtifacts: artifact.get('LeafStoryCount'),
                    AcceptedLeafArtifacts: artifact.get('AcceptedLeafStoryCount'),
                    TotalLeafPlanEstimate: artifact.get('LeafStoryPlanEstimateTotal'),
                    AcceptedLeafPlanEstimate: artifact.get('AcceptedLeafStoryPlanEstimateTotal'),
                    _ref: artifact.get('_ref'),
                    leaf: true,
                    expandable: false,
                    expanded: false,
                    iconCls: 'no-icon'
                });
                
                artifactTreeNodeCollection.push(artifactNode);
            }
        });*/
    },
    
    _getAllAssociatedMilestones: function(valuestream, milestoneStoreData){
        var milestoneColl = [];
        var that = this;
        
        Ext.Array.each(milestoneStoreData, function(milestone) {
            var vsRecord = milestone.get('c_ValueStream');
            vsRecord = vsRecord !== '' ? vsRecord : 'NA';
            
            if(vsRecord === valuestream){
                milestoneColl.push(milestone);
            }
        });
        
        return milestoneColl;
    },
    
    _getTargetProjectObjectIDFromRef: function(_ref){
        var objectId = Number(_ref.replace('/project/', ''));
        return objectId;
    }
});