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
                name: 'notesFilter',
                xtype: 'rallytextfield',
                fieldLabel: 'Notes Filter'    
            },
            {
                name: 'showNumberOfMonths',
                xtype: 'rallynumberfield',
                fieldLabel: 'Date Range (months)'
            },
            {
                name: 'includeGlobalMilestones',
                xtype: 'rallycheckboxfield',
                fieldLabel: '',
                boxLabel: 'Include global milestones'
            }
            // {
            //     name: 'groupByValueStream',
            //     xtype: 'rallycheckboxfield',
            //     fieldLabel: '',
            //     boxLabel: 'Group by Value Stream'
            // }
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
    
    _loadAllChildProjectsFromParent: function(parentProjRef){
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
        
        //only include milestones shared for all projects if the setting is enabled
        if (this.getSetting('includeGlobalMilestones')) {        
            this.projectMilestoneFilter = this.projectMilestoneFilter.or(Ext.create('Rally.data.wsapi.Filter', {
                property: 'TargetProject',
                operator: '=',
                value : 'NULL'
            }));
        }
        
        
        //only apply filtering on the notes field if configured
        if (this.getSetting('notesFilter')) {
            this.projectMilestoneFilter = this.projectMilestoneFilter.and(Ext.create('Rally.data.wsapi.Filter', {
                                    property: 'Notes',
                                    operator: 'contains',
                                    value: this.getSetting('notesFilter')
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
        var that = this;
        
        var myStore = Ext.create("Rally.data.wsapi.Store", {
            model: 'milestone',
            autoLoad: true,
            compact: false,
            listeners: {
                load: function(store, data, success) {
                    this._filterMileStones(data);
                },
                scope: this
            },
            filters : this.projectMilestoneFilter,
            sorters: [
                {
                    property: 'TargetProject',
                    direction: 'ASC'
                },
                {
                    property: 'TargetDate',
                    direction: 'ASC'
                }
            ]
        });
        
    },
    
    _filterMileStones: function(myData) {
        var that = this;
        //Filter out milestone will be stored here
        var filteredMilestonesArr = [];
        Ext.each(myData, function(data, index) {
            if(that.getSetting('includeGlobalMilestones') && data.data.TargetProject === null){
                filteredMilestonesArr.push(data);
            }
            else if(data.data.TargetProject !== null && data.data.TargetProject !== "" && (that.requiredProjectsList.indexOf(data.data.TargetProject.ObjectID) > -1)){
              filteredMilestonesArr.push(data);
            }
        });
        console.log("Filtered Milestone length : " + filteredMilestonesArr.length);
        
        this._organiseMilestoneBasedOnValuestream(filteredMilestonesArr);
        
    },
    
    _organiseMilestoneBasedOnValuestream: function(filteredMilestonesArr){
        this.valueStreamMilestoneColl = [];
        this.valueStreamColl = [];
        var nonVSCount = 0;
        var that = this;
        
        Ext.Array.each(filteredMilestonesArr, function(thisData){
            var valuestream = that._getValueStream(thisData);
            
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
        if(nonVSCount > 0)
            this.valueStreamColl.push('NA');
        
        console.log('ValueStream collection: ', this.valueStreamColl);
        
        Ext.Array.each(this.valueStreamColl, function(valuestream) {
            var milestoneColl = that._getAllAssociatedMilestones(valuestream, filteredMilestonesArr);
            
            that.valueStreamMilestoneColl.push({
                key: valuestream,
                value: milestoneColl
            });
        });
        
        console.log('ValueStream Milestone collection: ', this.valueStreamMilestoneColl);
        
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
        console.log('Valuestream Milestone Tree Node: ', valueStreamRootNode);
        
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
                        //width : 200,
                        hidden: true
                    },
                    {
                        text: 'Target Date', 
                        dataIndex: 'TargetDate',
                        flex: 1,
                        //width : 100,
                        renderer: function(value){
                            if(value)
                                return Rally.util.DateTime.format(value, 'M Y');
                        }
                    },
                    {
                        text: 'Color',
                        dataIndex: 'DisplayColor',
                        flex: 1,
                        //width : 100,
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
                        //width : 700
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
        
        return milestoneTreeNode;
    },
    
    _getAllAssociatedMilestones: function(valuestream, milestoneStoreData){
        var milestoneColl = [];
        var that = this;
        Ext.Array.each(milestoneStoreData, function(milestone) {
            var vsRecord = that._getValueStream(milestone);
            vsRecord = vsRecord !== '' ? vsRecord : 'NA';
            
            if(vsRecord === valuestream){
                milestoneColl.push(milestone);
            }
        });
        
        return milestoneColl;
    },
    
   //value stream is currently stored in notes (i.e. "valuestream:value")
    //this will change once we can create custom fields for milestones
    //TODO: find a more efficient way to do this
    _getValueStream: function(record) {
        var notes = record.get('Notes');
    
        //return an empty string if ther are no notes
        if (!notes || notes.length <= 0) {
            return '';
        }
            
        //find the value stream within Notes
        var indexForValueStream = notes.indexOf('valuestream:');
        
        if (indexForEndOfValueStream === -1) {
            return '';
        }
        
        var valueStreamText = notes.slice(indexForValueStream, notes.length);
        
        //there is no guarantee that the text will be within a <div>, so we can only check if we are either starting or ending an element
        var indexForEndOfValueStream = valueStreamText.indexOf('<');
            
        var valueStream = valueStreamText.slice((valueStreamText.indexOf(':') + 1), indexForEndOfValueStream);
            
        return valueStream;
    }
});